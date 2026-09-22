import { describe, expect, test } from 'bun:test'
import { makeJar } from '../../test/jar'
import { rangeContains } from '../lib/mc-version'
import { readJarMetadata } from './read-metadata'

function read(files: Record<string, string>) {
  const info = readJarMetadata(makeJar(files))
  if (!info) throw new Error('unreadable jar')
  return info
}

describe('fabric.mod.json', () => {
  test('reads fields, environment and deps', () => {
    const { meta, minecraft } = read({
      'fabric.mod.json': JSON.stringify({
        schemaVersion: 1,
        id: 'sodium',
        version: '0.6.0',
        name: 'Sodium',
        authors: ['JellySquid', { name: 'IMS' }],
        environment: 'client',
        depends: { minecraft: '>=1.21 <1.22', fabricloader: '>=0.16', 'fabric-api': '*' },
        contact: { homepage: 'https://example.com' },
      }),
    })
    expect(meta).toEqual({
      id: 'sodium',
      name: 'Sodium',
      version: '0.6.0',
      authors: ['JellySquid', 'IMS'],
      loaders: ['fabric'],
      side: 'client',
      depends: ['fabric-api'],
      homepage: 'https://example.com',
    })
    expect(minecraft && rangeContains(minecraft, '1.21.4')).toBe(true)
  })

  test('tolerates raw newlines inside strings', () => {
    const { meta } = read({ 'fabric.mod.json': '{"id":"x","description":"line1\nline2"}' })
    expect(meta.id).toBe('x')
    expect(meta.side).toBe('both')
  })
})

test('quilt.mod.json', () => {
  const { meta, minecraft } = read({
    'quilt.mod.json': JSON.stringify({
      quilt_loader: {
        id: 'qmod',
        version: '1.0.0',
        metadata: { name: 'Q Mod', contributors: { Alice: 'Owner' } },
        depends: ['quilt_loader', { id: 'minecraft', versions: '1.20.1' }, 'qsl'],
      },
      minecraft: { environment: 'dedicated_server' },
    }),
  })
  expect(meta).toMatchObject({ id: 'qmod', loaders: ['quilt'], side: 'server', depends: ['qsl'] })
  expect(meta.authors).toEqual(['Alice'])
  expect(minecraft?.candidates).toContain('1.20.1')
})

describe('mods.toml', () => {
  const neoToml = `
modLoader = "javafml"
loaderVersion = "[1,)"
[[mods]]
modId = "create"
version = "\${file.jarVersion}"
displayName = "Create"
authors = "simibubi, and others"
[[dependencies.create]]
modId = "neoforge"
type = "required"
versionRange = "[21.1.219,)"
side = "BOTH"
[[dependencies.create]]
modId = "minecraft"
type = "required"
versionRange = "[1.21.1]"
side = "BOTH"
[[dependencies.create]]
modId = "ponder"
type = "required"
side = "BOTH"
[[dependencies.create]]
modId = "jei"
type = "optional"
side = "CLIENT"
`

  test('neoforge.mods.toml with a manifest version placeholder', () => {
    const { meta, minecraft } = read({
      'META-INF/neoforge.mods.toml': neoToml,
      'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\r\nImplementation-Version: 6.0.10\r\n\r\n',
    })
    expect(meta).toMatchObject({
      id: 'create',
      name: 'Create',
      version: '6.0.10',
      authors: ['simibubi', 'others'],
      loaders: ['neoforge'],
      side: 'unknown',
      depends: ['ponder'],
    })
    expect(minecraft && rangeContains(minecraft, '1.21.1')).toBe(true)
  })

  test('old mods.toml depending on neoforge is NeoForge, otherwise Forge', () => {
    expect(read({ 'META-INF/mods.toml': neoToml }).meta.loaders).toEqual(['neoforge'])
    const forge = neoToml.replace('modId = "neoforge"', 'modId = "forge"\nmandatory = true')
    expect(read({ 'META-INF/mods.toml': forge }).meta.loaders).toEqual(['forge'])
  })

  test('client side from the minecraft dependency or displayTest', () => {
    const client = neoToml.replace(
      'versionRange = "[1.21.1]"\nside = "BOTH"',
      'versionRange = "[1.21.1]"\nside = "CLIENT"',
    )
    expect(read({ 'META-INF/neoforge.mods.toml': client }).meta.side).toBe('client')
    const display = neoToml.replace(
      'displayName = "Create"',
      'displayName = "Create"\ndisplayTest = "IGNORE_SERVER_VERSION"',
    )
    expect(read({ 'META-INF/neoforge.mods.toml': display }).meta.side).toBe('client')
  })
})

test('mcmod.info (legacy Forge)', () => {
  const { meta, minecraft } = read({
    'mcmod.info': JSON.stringify([
      { modid: 'jei', name: 'JEI', version: '4.16', mcversion: '1.12.2', authorList: ['mezz'] },
    ]),
  })
  expect(meta).toMatchObject({ id: 'jei', loaders: ['forge'], authors: ['mezz'] })
  expect(minecraft?.candidates).toContain('1.12.2')
})

describe('plugins', () => {
  test('plugin.yml', () => {
    const { meta, minecraft } = read({
      'plugin.yml':
        'name: EssentialsX\nversion: 2.21\nauthors: [md_5, zenexer]\ndepend: [Vault]\nfolia-supported: true\n',
    })
    expect(meta).toMatchObject({
      id: 'EssentialsX',
      version: '2.21',
      side: 'server',
      depends: ['Vault'],
      authors: ['md_5', 'zenexer'],
    })
    expect(meta.loaders).toContain('folia')
    expect(minecraft).toBeNull()
  })

  test('paper-plugin.yml', () => {
    const { meta } = read({
      'paper-plugin.yml':
        'name: P\nversion: "1"\ndependencies:\n  server:\n    A: { required: true }\n    B: { required: false }\n',
    })
    expect(meta).toMatchObject({ loaders: ['paper', 'purpur'], depends: ['A'] })
  })

  test('bungee.yml and velocity-plugin.json', () => {
    expect(read({ 'bungee.yml': 'name: B\nversion: 1\n' }).meta.loaders).toEqual([
      'bungeecord',
      'waterfall',
    ])
    const v = read({
      'velocity-plugin.json': JSON.stringify({
        id: 'lp',
        dependencies: [{ id: 'a' }, { id: 'b', optional: true }],
      }),
    })
    expect(v.meta).toMatchObject({ id: 'lp', loaders: ['velocity'], depends: ['a'] })
  })
})

test('multi-loader jar lists every loader; the most specific format wins the fields', () => {
  const { meta } = read({
    'fabric.mod.json': JSON.stringify({ id: 'multi', name: 'From Fabric', environment: '*' }),
    'META-INF/neoforge.mods.toml': '[[mods]]\nmodId = "multi"\ndisplayName = "From Neo"\n',
  })
  expect(meta.loaders).toEqual(['fabric', 'neoforge'])
  expect(meta.name).toBe('From Fabric')
})

test('unknown and broken jars', () => {
  expect(read({ 'readme.txt': 'hi' }).meta.loaders).toEqual([])
  expect(read({ 'fabric.mod.json': '{ not json' }).meta.loaders).toEqual([])
  expect(readJarMetadata(new TextEncoder().encode('not a zip'))).toBeNull()
})
