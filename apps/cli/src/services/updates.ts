import {
  type InstalledMod,
  type ModSource,
  type ModsResponse,
  type ModUpdate,
  type ProjectVersion,
  type Provider,
  providerLabel,
  type RankedVersion,
  type UpdateJobItem,
  type UpdateJobResponse,
} from '@mc-mod/shared'
import { AppError } from '../errors'
import { eachLimit } from '../lib/each-limit'
import type { CurseForgeProvider } from '../providers/curseforge'
import type { CatalogService } from './catalog'
import { projectKey } from './identify'
import type { InstallerService, ReplaceTarget } from './installer'
import type { LibraryService } from './library'
import type { VersionContext } from './versions'

/** Projects whose versions are fetched at once while checking. */
const CONCURRENCY = 6

/**
 * Update check results of this run, by jar sha1. They only hold for the loader, game version and
 * pre-release setting they were found with, so a change to any of those drops them.
 */
export class UpdateStore {
  private context = ''
  private readonly bySha1 = new Map<string, ModUpdate>()

  constructor(private readonly currentContext: () => VersionContext) {}

  private key(): string {
    const c = this.currentContext()
    return JSON.stringify([c.loader, c.gameVersion, c.contentKind, c.allowPrerelease])
  }

  get(sha1: string): ModUpdate | undefined {
    return this.context === this.key() ? this.bySha1.get(sha1) : undefined
  }

  /** Saves one check's results; `undefined` means up to date. Jars not in `results` keep theirs. */
  save(results: ReadonlyMap<string, ModUpdate | undefined>): void {
    const key = this.key()
    if (key !== this.context) {
      this.bySha1.clear()
      this.context = key
    }
    for (const [sha1, update] of results) {
      if (update) this.bySha1.set(sha1, update)
      else this.bySha1.delete(sha1)
    }
  }
}

/** The source updates come from. */
export function updateSource(mod: InstalledMod): ModSource | undefined {
  return mod.sources.find((s) => s.provider === mod.primarySource) ?? mod.sources[0]
}

/** The mod with `update` set, if it's from the source updates use now (the user may have switched). */
export function withUpdate(mod: InstalledMod, update: ModUpdate | undefined): InstalledMod {
  const { update: _, ...rest } = mod
  return update && update.provider === updateSource(mod)?.provider ? { ...rest, update } : rest
}

/**
 * The update for an installed jar, given its project's versions for this instance (ranked, as the
 * project page lists them). It's the recommended version, when that's another file and:
 * - the installed version is in the list and older (never a downgrade, e.g. off a beta while
 *   pre-releases are off), or doesn't fit the instance, or
 * - the installed version is known but not in the list, so it doesn't fit the instance either.
 * A jar linked by hand or by a launcher without the exact file gets none: its version isn't known.
 */
export function findUpdate(
  mod: Pick<InstalledMod, 'sha1'>,
  source: Pick<ModSource, 'versionId'>,
  versions: readonly RankedVersion[],
): ModUpdate | undefined {
  const best = versions.find((v) => v.recommended)
  const file = best?.file
  if (!best || !file) return undefined
  const isInstalled = (v: ProjectVersion) =>
    v.id === source.versionId || v.file?.sha1?.toLowerCase() === mod.sha1
  if (isInstalled(best)) return undefined

  const installed = versions.find(isInstalled)
  if (installed) {
    if (installed.compatible && Date.parse(best.publishedAt) <= Date.parse(installed.publishedAt)) {
      return undefined
    }
  } else if (!source.versionId) {
    return undefined
  }
  return {
    provider: best.provider,
    projectId: best.projectId,
    versionId: best.id,
    versionNumber: best.versionNumber,
    publishedAt: best.publishedAt,
    fileName: file.name,
    size: file.size,
    manual: file.url === null,
    pageUrl: best.pageUrl,
  }
}

export interface UpdatesDeps {
  library: Pick<LibraryService, 'list'>
  catalog: Pick<CatalogService, 'versions' | 'versionsByIds'>
  installer: Pick<InstallerService, 'replace'>
  curseforge: Pick<CurseForgeProvider, 'enabled'>
  store: UpdateStore
}

/** Checking for and installing updates of identified jars (architecture §7.3, §7.5). */
export class UpdatesService {
  constructor(private readonly deps: UpdatesDeps) {}

  /**
   * Looks for updates of every identified jar on its primary source: one versions request per project,
   * a few at a time (and cached for a few minutes). A platform that can't be reached is a warning.
   */
  async check(): Promise<ModsResponse> {
    const { mods, warnings } = await this.deps.library.list()
    const groups = new Map<
      string,
      { provider: Provider; projectId: string; mods: InstalledMod[] }
    >()
    let noKey = 0
    for (const mod of mods) {
      const source = updateSource(mod)
      if (!source) continue
      if (source.provider === 'curseforge' && !this.deps.curseforge.enabled()) {
        noKey++
        continue
      }
      const key = projectKey(source.provider, source.projectId)
      const group = groups.get(key) ?? {
        provider: source.provider,
        projectId: source.projectId,
        mods: [],
      }
      group.mods.push(mod)
      groups.set(key, group)
    }

    const results = new Map<string, ModUpdate | undefined>()
    const failed = new Map<Provider, number>()
    await eachLimit([...groups.values()], CONCURRENCY, async (group) => {
      let versions: RankedVersion[]
      try {
        versions = await this.deps.catalog.versions(group.provider, group.projectId, false)
      } catch (err) {
        if (!(err instanceof AppError)) throw err
        // The project is gone from the platform: nothing to update to.
        if (err.code === 'NOT_FOUND') {
          for (const m of group.mods) results.set(m.sha1, undefined)
        } else {
          failed.set(group.provider, (failed.get(group.provider) ?? 0) + group.mods.length)
        }
        return
      }
      for (const m of group.mods) {
        const source = updateSource(m)
        if (source) results.set(m.sha1, findUpdate(m, source, versions))
      }
    })
    this.deps.store.save(results)

    if (noKey > 0) {
      warnings.push(
        `Add a CurseForge API key in Settings to check ${plural(noKey, 'CurseForge file')} for updates.`,
      )
    }
    for (const [provider, n] of failed) {
      warnings.push(
        `Couldn't check ${plural(n, `${providerLabel[provider]} file`)} for updates. Try again later.`,
      )
    }
    return {
      mods: mods.map((m) => withUpdate(m, this.deps.store.get(m.sha1))),
      warnings,
    }
  }

  /**
   * Replaces one jar: with the given version of its project ("Change version", newer or older), or with
   * the update the last check found, or else the best version for the instance.
   */
  async updateOne(fileName: string, versionId: string | undefined): Promise<UpdateJobResponse> {
    const mod = (await this.deps.library.list()).mods.find((m) => m.fileName === fileName)
    if (!mod) throw new AppError('NOT_FOUND', `${fileName} is not installed`)
    const source = updateSource(mod)
    if (!source) {
      throw new AppError('CONFLICT', `${fileName} isn't linked to a project, so it has no versions`)
    }
    const title = modTitle(mod)

    let wanted = versionId
    if (!wanted) {
      const update =
        mod.update ??
        findUpdate(
          mod,
          source,
          await this.deps.catalog.versions(source.provider, source.projectId, false),
        )
      if (!update) throw new AppError('CONFLICT', `${title} is up to date`)
      wanted = update.versionId
    }
    const version = (await this.deps.catalog.versionsByIds(source.provider, [wanted])).get(wanted)
    if (!version || version.projectId !== source.projectId) {
      throw new AppError('NOT_FOUND', `${title} has no version "${wanted}"`)
    }
    if (version.id === source.versionId || version.file?.sha1?.toLowerCase() === mod.sha1) {
      throw new AppError('CONFLICT', `${title} ${version.versionNumber} is already installed`)
    }
    return this.start([{ mod, version }])
  }

  /** Updates the jars the last check found updates for (or only `fileNames`), except manual ones. */
  async updateAll(fileNames: readonly string[] | undefined): Promise<UpdateJobResponse> {
    const only = fileNames ? new Set(fileNames) : undefined
    const due = (await this.deps.library.list()).mods.filter(
      (m) => m.update && !m.update.manual && (!only || only.has(m.fileName)),
    )
    if (due.length === 0) {
      throw new AppError('CONFLICT', 'Nothing to update. Check for updates first.')
    }

    const targets: ReplaceTarget[] = []
    for (const provider of new Set(due.flatMap((m) => (m.update ? [m.update.provider] : [])))) {
      const mine = due.filter((m) => m.update?.provider === provider)
      const versions = await this.deps.catalog.versionsByIds(
        provider,
        mine.flatMap((m) => (m.update ? [m.update.versionId] : [])),
      )
      for (const mod of mine) {
        const version = mod.update && versions.get(mod.update.versionId)
        if (version) targets.push({ mod, version })
      }
    }
    if (targets.length === 0) {
      throw new AppError('NOT_FOUND', 'The updates are no longer available. Check again.')
    }
    return this.start(targets)
  }

  private async start(targets: ReplaceTarget[]): Promise<UpdateJobResponse> {
    const { jobId } = await this.deps.installer.replace(targets)
    const items: UpdateJobItem[] = targets.map(({ mod, version }) => ({
      fileName: mod.fileName,
      title: modTitle(mod),
      fromVersion: updateSource(mod)?.versionNumber ?? mod.meta?.version,
      toVersion: version.versionNumber,
    }))
    return { jobId, items }
  }
}

function modTitle(m: InstalledMod): string {
  return updateSource(m)?.title ?? m.meta?.name ?? m.fileName
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
