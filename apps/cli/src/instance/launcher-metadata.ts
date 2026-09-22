import path from 'node:path'
import type { ModSource } from '@mc-mod/shared'
import { parse as parseToml } from 'smol-toml'
import { z } from 'zod'
import { enabledName, type ScannedJar } from '../jar/scan'
import { list, readJson, readText } from './detectors/fs'

// Sources that other launchers recorded for the jars they installed (architecture §7.2, method 3).
// Schemas are loose and cover only the fields we read.

type Found = Omit<ModSource, 'method'>

const Id = z.union([z.string().min(1), z.number().int()]).transform(String)

// https://packwiz.infra.link/reference/pack-format/mod-toml/ (Prism writes these to mods/.index/)
const PackwizMod = z.looseObject({
  filename: z.string(),
  name: z.string().optional(),
  download: z
    .looseObject({ 'hash-format': z.string().optional(), hash: z.string().optional() })
    .optional(),
  update: z
    .looseObject({
      modrinth: z.looseObject({ 'mod-id': Id, version: Id.optional() }).optional(),
      curseforge: z.looseObject({ 'project-id': Id, 'file-id': Id.optional() }).optional(),
    })
    .optional(),
})

/** CurseForge app: `minecraftinstance.json` → `installedAddons[]`. */
const CurseForgeInstance = z.looseObject({
  installedAddons: z.array(
    z.looseObject({
      addonID: Id,
      name: z.string().optional(),
      installedFile: z
        .looseObject({
          id: Id.optional(),
          fileName: z.string().optional(),
          fileNameOnDisk: z.string().optional(),
          fileFingerprint: z.number().optional(),
          displayName: z.string().optional(),
        })
        .nullable()
        .optional(),
    }),
  ),
})

/** ATLauncher: `instance.json` → `launcher.mods[]` (DisableableMod). */
const AtLauncherInstance = z.looseObject({
  launcher: z.looseObject({
    mods: z.array(
      z.looseObject({
        name: z.string().optional(),
        version: z.string().optional(),
        file: z.string(),
        curseForgeProjectId: Id.nullable().optional(),
        curseForgeFileId: Id.nullable().optional(),
        modrinthProject: z
          .looseObject({
            id: z.string(),
            slug: z.string().optional(),
            title: z.string().optional(),
          })
          .nullable()
          .optional(),
        modrinthVersion: z
          .looseObject({ id: z.string(), version_number: z.string().optional() })
          .nullable()
          .optional(),
      }),
    ),
  }),
})

/** True if a packwiz hash is present and disagrees with the file, i.e. the jar was replaced since. */
function packwizHashMismatch(jar: ScannedJar, format?: string, hash?: string): boolean {
  if (!format || !hash) return false
  const h = hash.toLowerCase()
  switch (format.toLowerCase()) {
    case 'sha1':
      return h !== jar.sha1
    case 'sha512':
      return h !== jar.sha512
    case 'murmur2':
      return Number(h) !== jar.cfFingerprint
    default:
      return false // sha256/md5: we don't compute them, so the file name has to do
  }
}

async function fromPackwiz(contentDir: string, jars: Map<string, ScannedJar>): Promise<Entry[]> {
  const indexDir = path.join(contentDir, '.index')
  const files = (await list(indexDir)).filter((f) => f.endsWith('.pw.toml'))
  const out: Entry[] = []
  for (const f of files) {
    const text = await readText(path.join(indexDir, f))
    if (text === undefined) continue
    let raw: unknown
    try {
      raw = parseToml(text)
    } catch {
      continue
    }
    const parsed = PackwizMod.safeParse(raw)
    if (!parsed.success) continue
    const m = parsed.data
    const jar = jars.get(path.posix.basename(m.filename))
    if (!jar || packwizHashMismatch(jar, m.download?.['hash-format'], m.download?.hash)) continue
    const title = m.name
    if (m.update?.modrinth) {
      const u = m.update.modrinth
      out.push([jar, { provider: 'modrinth', projectId: u['mod-id'], versionId: u.version, title }])
    }
    if (m.update?.curseforge) {
      const u = m.update.curseforge
      out.push([
        jar,
        { provider: 'curseforge', projectId: u['project-id'], versionId: u['file-id'], title },
      ])
    }
  }
  return out
}

async function fromCurseForgeApp(root: string, jars: Map<string, ScannedJar>): Promise<Entry[]> {
  const parsed = CurseForgeInstance.safeParse(
    await readJson(path.join(root, 'minecraftinstance.json')),
  )
  if (!parsed.success) return []
  const out: Entry[] = []
  for (const addon of parsed.data.installedAddons) {
    const file = addon.installedFile
    const name = file?.fileNameOnDisk ?? file?.fileName
    const jar = name ? jars.get(enabledName(name)) : undefined
    if (!jar || !file) continue
    if (file.fileFingerprint !== undefined && file.fileFingerprint !== jar.cfFingerprint) continue
    out.push([
      jar,
      {
        provider: 'curseforge',
        projectId: addon.addonID,
        versionId: file.id,
        versionNumber: file.displayName,
        title: addon.name,
      },
    ])
  }
  return out
}

async function fromAtLauncher(root: string, jars: Map<string, ScannedJar>): Promise<Entry[]> {
  const parsed = AtLauncherInstance.safeParse(await readJson(path.join(root, 'instance.json')))
  if (!parsed.success) return []
  const out: Entry[] = []
  for (const m of parsed.data.launcher.mods) {
    const jar = jars.get(enabledName(m.file))
    if (!jar) continue
    if (m.modrinthProject) {
      out.push([
        jar,
        {
          provider: 'modrinth',
          projectId: m.modrinthProject.id,
          versionId: m.modrinthVersion?.id,
          versionNumber: m.modrinthVersion?.version_number ?? m.version,
          slug: m.modrinthProject.slug,
          title: m.modrinthProject.title ?? m.name,
        },
      ])
    }
    if (m.curseForgeProjectId) {
      out.push([
        jar,
        {
          provider: 'curseforge',
          projectId: m.curseForgeProjectId,
          versionId: m.curseForgeFileId ?? undefined,
          versionNumber: m.version,
          title: m.name,
        },
      ])
    }
  }
  return out
}

type Entry = [ScannedJar, Found]

/**
 * Sources recorded by packwiz/Prism, the CurseForge app and ATLauncher, keyed by sha1.
 * At most one per provider per jar; the first reader that has one wins.
 */
export async function readLauncherMetadata(
  root: string,
  contentDir: string,
  jars: readonly ScannedJar[],
): Promise<Map<string, ModSource[]>> {
  const byName = new Map(jars.map((j) => [enabledName(j.fileName), j]))
  const entries = (
    await Promise.all([
      fromPackwiz(contentDir, byName),
      fromCurseForgeApp(root, byName),
      fromAtLauncher(root, byName),
    ])
  ).flat()

  const out = new Map<string, ModSource[]>()
  for (const [jar, found] of entries) {
    const sources = out.get(jar.sha1) ?? []
    if (sources.some((s) => s.provider === found.provider)) continue
    sources.push({ ...found, method: 'launcher-metadata' })
    out.set(jar.sha1, sources)
  }
  return out
}
