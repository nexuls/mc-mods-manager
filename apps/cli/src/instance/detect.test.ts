import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { Instance } from '@mc-mod/shared'
import { copyFixture } from '../../test/fixtures'
import { makeJar } from '../../test/jar'
import { detectInstance } from './detect'
import { javaMajor, parseCurseForgeLoader } from './detectors/launchers'

async function detect(fixture: string, sub = '.', options = {}) {
  await using f = await copyFixture(fixture)
  const instance = Instance.parse(await detectInstance(path.join(f.dir, sub), options))
  // Paths relative to the fixture copy, so assertions don't depend on the temp dir.
  const rel = (p: string) => path.relative(f.dir, p) || '.'
  return {
    ...instance,
    root: rel(instance.root),
    gameDir: rel(instance.gameDir),
    contentDir: rel(instance.contentDir),
  }
}

describe('launcher manifests', () => {
  test('Prism: mmc-pack.json, game dir inside the instance', async () => {
    const i = await detect('prism')
    expect(i).toMatchObject({
      root: '.',
      gameDir: 'minecraft',
      contentDir: path.join('minecraft', 'mods'),
      kind: 'client',
      gameVersion: '1.21.4',
      loader: 'fabric',
      loaderVersion: '0.16.9',
    })
    expect(i.detection[0]).toMatchObject({ confidence: 'high', detail: 'mmc-pack.json' })
  })

  test('Prism: started in the game dir or its mods folder', async () => {
    expect((await detect('prism', 'minecraft')).root).toBe('.')
    expect(await detect('prism', 'minecraft/mods')).toMatchObject({
      root: '.',
      contentDir: path.join('minecraft', 'mods'),
    })
  })

  test('CurseForge app', async () => {
    expect(await detect('curseforge-app')).toMatchObject({
      gameVersion: '1.20.1',
      loader: 'forge',
      loaderVersion: '47.2.0',
      contentDir: 'mods',
    })
  })

  test('ATLauncher', async () => {
    expect(await detect('atlauncher')).toMatchObject({
      gameVersion: '1.20.1',
      loader: 'quilt',
      loaderVersion: '0.26.0',
    })
  })

  test('Modrinth App', async () => {
    expect(await detect('modrinth-app')).toMatchObject({
      gameVersion: '1.21.1',
      loader: 'fabric',
      loaderVersion: '0.16.5',
    })
  })

  test('Java version: instance.cfg wins, then the version manifest, then the game version', async () => {
    // Prism records the Java it ran with.
    expect((await detect('prism')).javaVersion).toEqual({ major: 21, source: 'detected' })
    // A modded version json inherits `javaVersion` from the release it extends.
    expect((await detect('vanilla-launcher', '.minecraft/profiles/fabric')).javaVersion).toEqual({
      major: 21,
      source: 'detected',
    })
    // Nothing wrote it down, so it comes from what 1.21.1 needs.
    expect((await detect('tlauncher', '.minecraft/home/NeoForge 1.21.1/mods')).javaVersion).toEqual(
      {
        major: 21,
        source: 'game-version',
      },
    )
    expect((await detect('empty')).javaVersion).toBeNull()
  })

  test('javaMajor', () => {
    expect(javaMajor('21.0.8')).toBe(21)
    expect(javaMajor('1.8.0_292')).toBe(8)
    expect(javaMajor('17')).toBe(17)
    expect(javaMajor('nonsense')).toBeUndefined()
  })

  test('parseCurseForgeLoader', () => {
    expect(parseCurseForgeLoader('neoforge-21.1.77')).toEqual({
      loader: 'neoforge',
      version: '21.1.77',
    })
    expect(parseCurseForgeLoader('fabric-0.15.0-1.20.1')).toEqual({
      loader: 'fabric',
      version: '0.15.0',
    })
    expect(parseCurseForgeLoader('liteloader-1')).toBeUndefined()
  })
})

describe('version json', () => {
  test('TLauncher home/<id> game dir, started in its mods folder', async () => {
    const i = await detect('tlauncher', '.minecraft/home/NeoForge 1.21.1/mods')
    expect(i).toMatchObject({
      root: path.join('.minecraft', 'home', 'NeoForge 1.21.1'),
      gameVersion: '1.21.1',
      loader: 'neoforge',
      loaderVersion: '21.1.250',
      contentDir: path.join('.minecraft', 'home', 'NeoForge 1.21.1', 'mods'),
    })
    expect(i.detection[0]?.confidence).toBe('high')
  })

  test('launcher profile with a custom game dir', async () => {
    const i = await detect('vanilla-launcher', '.minecraft/profiles/fabric')
    expect(i).toMatchObject({ gameVersion: '1.21.4', loader: 'fabric', loaderVersion: '0.16.9' })
    expect(i.detection[0]?.confidence).toBe('high')
  })

  test('.minecraft root: most recently used profile, others as suggestions', async () => {
    const i = await detect('vanilla-launcher', '.minecraft')
    expect(i).toMatchObject({ gameVersion: '1.20.1', loader: 'forge', loaderVersion: '47.2.0' })
    expect(i.detection[0]?.confidence).toBe('medium')
    expect(i.suggestions.map((s) => s.label).sort()).toEqual([
      '1.20.1-forge-47.2.0',
      'fabric-loader-0.16.9-1.21.4',
      'neoforge-21.1.77',
    ])
    expect(i.warnings.join()).toContain('Several versions')
  })

  test('started inside versions/<id>: shared mods folder warning', async () => {
    const i = await detect('vanilla-launcher', '.minecraft/versions/neoforge-21.1.77')
    expect(i).toMatchObject({
      root: '.minecraft',
      contentDir: path.join('.minecraft', 'mods'),
      gameVersion: '1.21.1',
      loader: 'neoforge',
      loaderVersion: '21.1.77',
    })
    expect(i.warnings.join()).toContain('shares')
  })
})

describe('servers', () => {
  test.each([
    ['fabric-server', { loader: 'fabric', loaderVersion: '0.16.9', gameVersion: '1.21.4' }],
    ['neoforge-server', { loader: 'neoforge', loaderVersion: '21.1.77', gameVersion: '1.21.1' }],
    ['forge-server', { loader: 'forge', loaderVersion: '47.2.0', gameVersion: '1.20.1' }],
    ['paper-server', { loader: 'paper', gameVersion: '1.21.4', contentDir: 'plugins' }],
    ['purpur-server', { loader: 'purpur', gameVersion: '1.21.3', contentKind: 'plugin' }],
    ['velocity', { loader: 'velocity', gameVersion: null, contentDir: 'plugins' }],
    ['bungeecord', { loader: 'bungeecord', contentDir: 'plugins' }],
  ])('%s', async (fixture, expected) => {
    expect(await detect(fixture)).toMatchObject({ kind: 'server', ...expected })
  })
})

describe('installed jars heuristic', () => {
  const neo = (mc: string) => ({
    'META-INF/neoforge.mods.toml': `[[mods]]\nmodId="m"\n[[dependencies.m]]\nmodId="minecraft"\ntype="required"\nversionRange="${mc}"\n`,
  })

  test('majority loader and game version, flagged low confidence', async () => {
    await using f = await copyFixture('jars-only')
    const mods = path.join(f.dir, 'mods')
    const jars = [neo('[1.21.1]'), neo('[1.21.1,1.22)'), neo('[1.21,)'), neo('[1.20.4]')]
    await Promise.all(jars.map((j, n) => Bun.write(path.join(mods, `m${n}.jar`), makeJar(j))))
    await Bun.write(
      path.join(mods, 'fab.jar'),
      makeJar({ 'fabric.mod.json': '{"id":"f","depends":{"minecraft":"1.19.2"}}' }),
    )

    const i = await detectInstance(mods)
    expect(i).toMatchObject({ gameVersion: '1.21.1', loader: 'neoforge', loaderVersion: null })
    expect(i.detection[0]).toMatchObject({ confidence: 'low', fields: ['gameVersion', 'loader'] })
    expect(i.warnings.join()).toContain('1 of 4 jars')
  })
})

describe('nothing to go on', () => {
  test('empty folder needs setup', async () => {
    expect(await detect('empty')).toMatchObject({
      kind: 'client',
      gameVersion: null,
      loader: null,
      contentDir: 'mods',
      detection: [],
    })
  })
})

describe('overrides', () => {
  test('beat detection; loader version only kept for the same loader', async () => {
    const i = await detect('prism', '.', { overrides: { loader: 'quilt', gameVersion: '1.21.5' } })
    expect(i).toMatchObject({ gameVersion: '1.21.5', loader: 'quilt', loaderVersion: null })
    expect(i.detection[0]).toMatchObject({
      source: 'Your settings (.mc-mod/state.json)',
      fields: ['gameVersion', 'loader'],
    })
  })

  test('content dir override must stay inside the instance', async () => {
    expect((await detect('empty', '.', { overrides: { contentDir: 'custom' } })).contentDir).toBe(
      'custom',
    )
    await expect(detect('empty', '.', { overrides: { contentDir: '../x' } })).rejects.toThrow(
      'outside',
    )
  })
})
