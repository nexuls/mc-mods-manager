import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type {
  ExportBody,
  ExportMode,
  ExportPreview,
  ExportResult,
  InstalledMod,
} from '@mc-mod/shared'
import { zipSync } from 'fflate'
import type { ConfigService } from '../config'
import { AppError } from '../errors'
import {
  copyFileAtomic,
  isInside,
  removeInside,
  resolveInside,
  writeFileAtomic,
} from '../instance/paths'
import type { InstanceService } from './instance'
import type { LibraryService } from './library'

export interface ServerExportDeps {
  instance: Pick<InstanceService, 'instance'>
  library: Pick<LibraryService, 'list'>
  config: Pick<ConfigService, 'config'>
  /** Opens a folder in the OS file manager; false when there's no desktop to open it on. */
  openFolder: (dir: string) => Promise<boolean>
  now?: () => number
}

/** Splits mods for a server export (architecture §7.6): `unknown` is included, but reviewed. */
export function groupForExport(
  mods: readonly InstalledMod[],
): Pick<ExportPreview, 'include' | 'unknown' | 'exclude'> {
  const out: Pick<ExportPreview, 'include' | 'unknown' | 'exclude'> = {
    include: [],
    unknown: [],
    exclude: [],
  }
  for (const m of mods) {
    if (!m.enabled || m.side === 'client') out.exclude.push(m)
    else if (m.side === 'unknown') out.unknown.push(m)
    else out.include.push(m)
  }
  return out
}

/** `2026-09-22` in local time: the day the user sees on their clock. */
function localDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const isJar = (name: string) => name.toLowerCase().endsWith('.jar') && !name.startsWith('.')

/**
 * Server export: the server-side jars copied to `<instance>/<dirName>/` or zipped into the instance
 * root. Only reads the mods folder.
 */
export class ServerExportService {
  private running = false
  private readonly now: () => number

  constructor(private readonly deps: ServerExportDeps) {
    this.now = deps.now ?? Date.now
  }

  async preview(dirName?: string): Promise<ExportPreview> {
    const target = this.target(dirName)
    const { mods } = await this.deps.library.list()
    return {
      ...target,
      ...groupForExport(mods),
      existingJars: await this.existingJars(target.dir),
    }
  }

  async export(body: ExportBody): Promise<ExportResult> {
    // Two exports into one folder at once would remove each other's jars.
    if (this.running) throw new AppError('CONFLICT', 'An export is already running')
    this.running = true
    try {
      const target = this.target(body.dirName)
      const { mods } = await this.deps.library.list()
      const { include, unknown } = groupForExport(mods)
      const skip = new Set(body.exclude)
      const files = [...include, ...unknown].map((m) => m.fileName).filter((f) => !skip.has(f))
      return body.mode === 'copy'
        ? await this.copy(target.dir, files, body.clean)
        : await this.zip(path.join(this.root, target.zipName), files)
    } finally {
      this.running = false
    }
  }

  async reveal(mode: ExportMode, dirName?: string): Promise<{ opened: boolean; path: string }> {
    const dir = mode === 'copy' ? this.target(dirName).dir : this.root
    if (!(await isDir(dir))) {
      throw new AppError('NOT_FOUND', `${path.basename(dir)}/ doesn't exist yet. Export first.`)
    }
    return { opened: await this.deps.openFolder(dir), path: dir }
  }

  private get root(): string {
    return this.deps.instance.instance.root
  }

  /** The export folder for `dirName` (default: the setting), refused when it holds the mods folder. */
  private target(dirName?: string): Pick<ExportPreview, 'dir' | 'dirName' | 'zipName'> {
    const inst = this.deps.instance.instance
    if (inst.contentKind === 'plugin') {
      throw new AppError(
        'BAD_REQUEST',
        'Plugins only run on the server, so there is nothing to export.',
      )
    }
    const name = dirName ?? this.deps.config.config.exportDirName
    const dir = resolveInside(inst.root, name)
    // A clean export deletes jars in the folder, so it must never be the mods folder or hold it.
    if (isInside(dir, inst.contentDir) || isInside(inst.contentDir, dir)) {
      throw new AppError('BAD_REQUEST', `${name}/ is the mods folder. Pick another export folder.`)
    }
    const version = inst.gameVersion ?? 'unknown'
    return { dir, dirName: name, zipName: `${name}-${version}-${localDate(this.now())}.zip` }
  }

  private async existingJars(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((e) => e.isFile() && isJar(e.name))
      .map((e) => e.name)
      .sort()
  }

  /**
   * Copies first and removes old jars after, so a failed copy never leaves the folder emptier than
   * before. Same-named jars are replaced in place.
   */
  private async copy(dir: string, files: readonly string[], clean: boolean): Promise<ExportResult> {
    const { contentDir } = this.deps.instance.instance
    const before = clean ? await this.existingJars(dir) : []
    for (const f of files) {
      await copyFileAtomic(this.root, path.join(contentDir, f), path.join(dir, f))
    }
    const keep = new Set(files)
    const stale = before.filter((f) => !keep.has(f))
    for (const f of stale) await removeInside(dir, f)
    return { mode: 'copy', path: dir, count: files.length, removed: stale.length }
  }

  private async zip(file: string, files: readonly string[]): Promise<ExportResult> {
    const { contentDir } = this.deps.instance.instance
    const entries: Record<string, Uint8Array> = {}
    for (const f of files) {
      entries[f] = await Bun.file(resolveInside(this.root, path.join(contentDir, f))).bytes()
    }
    // Jars are zips already: store them rather than compress them again.
    const bytes = zipSync(entries, { level: 0, mtime: new Date(this.now()) })
    await writeFileAtomic(this.root, file, bytes)
    return { mode: 'zip', path: file, count: files.length, removed: 0 }
  }
}

async function isDir(dir: string): Promise<boolean> {
  return (await readdir(dir).catch(() => null)) !== null
}
