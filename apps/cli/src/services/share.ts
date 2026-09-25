import {
  type ImportCandidate,
  type ImportCheck,
  type ImportItem,
  type ImportPlan,
  type InstalledMod,
  type Instance,
  importStatus,
  loaderInfo,
  MOD_LIST_FORMAT,
  MOD_LIST_VERSION,
  type ModList,
  type ModListEntry,
  type ModListInstance,
  type ProjectVersion,
  type Provider,
  providerLabel,
  type RankedVersion,
} from '@mc-mod/shared'
import { AppError } from '../errors'
import { enabledName } from '../jar/scan'
import { eachLimit } from '../lib/each-limit'
import type { CurseForgeProvider } from '../providers/curseforge'
import type { CatalogService } from './catalog'
import { projectKey } from './identify'
import type { InstanceService } from './instance'
import type { LibraryService } from './library'
import { updateSource } from './updates'
import { rankVersions } from './versions'

/** Projects whose versions are looked up at once while planning an import. */
const CONCURRENCY = 6

export interface ShareDeps {
  instance: Pick<InstanceService, 'instance'>
  library: Pick<LibraryService, 'list'>
  catalog: Pick<
    CatalogService,
    'bestVersion' | 'versions' | 'versionsByIds' | 'versionContext' | 'describeTarget'
  >
  curseforge: Pick<CurseForgeProvider, 'enabled'>
  /** The mc-mod version written into exported lists. */
  version: string
  now?: () => number
  /** Unexpected errors while planning, after the entry is reported as unavailable. */
  onInternalError?: (err: unknown) => void
}

/**
 * Sharing the mod list: export it as a JSON file, and work out what importing someone else's file
 * would install here (architecture §7.7). Neither touches the mods folder; the import's ticked items
 * are installed through the normal install job.
 */
export class ShareService {
  private readonly now: () => number

  constructor(private readonly deps: ShareDeps) {
    this.now = deps.now ?? Date.now
  }

  /** The instance and every jar in its folder, as a mod list file. */
  async exportList(): Promise<ModList> {
    const { mods } = await this.deps.library.list()
    return {
      format: MOD_LIST_FORMAT,
      formatVersion: MOD_LIST_VERSION,
      createdAt: new Date(this.now()).toISOString(),
      generator: { name: 'mc-mod', version: this.deps.version },
      instance: describe(this.deps.instance.instance),
      mods: mods.map(entryOf),
    }
  }

  /**
   * What a shared list would do here. Versions are re-picked for this instance (the listed one when it
   * fits, else the best one), and mods already in the folder are reported as installed.
   */
  async importPlan(list: ModList): Promise<ImportPlan> {
    if (list.formatVersion > MOD_LIST_VERSION) {
      throw new AppError(
        'BAD_REQUEST',
        'This list was made by a newer mc-mod. Update mc-mod to import it.',
      )
    }
    const to = describe(this.deps.instance.instance)
    const { mods } = await this.deps.library.list()
    const installed = installedIndex(mods)
    const warnings: string[] = []

    const items: ImportItem[] = list.mods.map((entry) => this.baseItem(entry, installed))
    const due = items.flatMap((item, index) =>
      item.status === 'install' ? [{ item, entry: list.mods[index] }] : [],
    )
    let failed = 0
    await eachLimit(due, CONCURRENCY, async ({ item, entry }) => {
      if (!entry) return
      try {
        await this.resolve(item, entry)
      } catch (err) {
        // One project the platform can't answer for must not lose the other 200 entries.
        failed++
        item.status = 'unavailable'
        item.reason = err instanceof AppError ? err.message : 'Could not be looked up'
        if (!(err instanceof AppError)) this.deps.onInternalError?.(err)
      }
    })

    const checks = compare(list.instance, to)
    for (const c of checks.filter((c) => c.match === 'differs')) {
      warnings.push(`The list was made for ${c.label} ${c.theirs}; this instance is ${c.ours}.`)
    }
    const noKey = items.filter(
      (i) =>
        i.provider === 'curseforge' &&
        i.status === 'unavailable' &&
        !this.deps.curseforge.enabled(),
    ).length
    if (noKey > 0) {
      warnings.push(
        `Add a CurseForge API key in Settings to install ${plural(noKey, 'CurseForge file')} from this list.`,
      )
    }
    const stuck = items.filter((i) => i.status === 'incompatible').length
    if (stuck > 0) {
      warnings.push(
        `${plural(stuck, 'file')} in the list ${stuck === 1 ? 'has' : 'have'} no version for ${this.deps.catalog.describeTarget()}. Turn on "Include what doesn't fit" to take them anyway.`,
      )
    }
    const local = items.filter((i) => i.status === 'local').length
    if (local > 0) {
      warnings.push(
        `${plural(local, 'file')} in the list ${local === 1 ? "isn't" : "aren't"} on Modrinth or CurseForge. Ask whoever shared it for the ${local === 1 ? 'jar' : 'jars'}.`,
      )
    }
    if (failed > 0) {
      warnings.push(`Couldn't look ${plural(failed, 'file')} up. Try again later.`)
    }

    return {
      createdAt: list.createdAt,
      generator: list.generator,
      from: list.instance,
      to,
      checks,
      items,
      bridges: [...(this.deps.catalog.versionContext().bridges ?? [])],
      warnings,
    }
  }

  /** The item before any lookup: installed and local entries are already settled. */
  private baseItem(entry: ModListEntry, installed: InstalledIndex): ImportItem {
    const item: ImportItem = {
      fileName: entry.fileName,
      title: entry.source?.title ?? entry.name,
      iconUrl: entry.source?.iconUrl,
      side: entry.side,
      enabled: entry.enabled,
      status: 'install',
      provider: entry.source?.provider,
      projectId: entry.source?.projectId,
      listedVersion: entry.version,
    }
    const have =
      (entry.sha1 ? installed.bySha1.get(entry.sha1) : undefined) ??
      (entry.source
        ? installed.byProject.get(projectKey(entry.source.provider, entry.source.projectId))
        : undefined)
    if (have) {
      item.status = 'installed'
      item.reason =
        entry.sha1 && entry.sha1 === have.sha1
          ? `Installed as ${have.fileName}`
          : `Another version is installed (${installedVersion(have) ?? have.fileName})`
      return item
    }
    if (!entry.source) {
      item.status = 'local'
      item.reason = 'Not on Modrinth or CurseForge'
      return item
    }
    if (entry.source.provider === 'curseforge' && !this.deps.curseforge.enabled()) {
      item.status = 'unavailable'
      item.reason = 'Needs a CurseForge API key'
    }
    return item
  }

  /**
   * Finds the files this item could be installed from: the exact one the list pinned, and the best one
   * for this instance. When neither exists, the project's newest downloadable file is offered as a
   * last resort, so "include what doesn't fit" has something to take.
   */
  private async resolve(item: ImportItem, entry: ModListEntry): Promise<void> {
    const source = entry.source
    if (!source) return
    const ctx = this.deps.catalog.versionContext()

    if (source.versionId) {
      const pinned = (
        await this.deps.catalog.versionsByIds(source.provider, [source.versionId])
      ).get(source.versionId)
      if (pinned && pinned.projectId === source.projectId) {
        item.shared = candidateOf(rankVersions([pinned], ctx)[0] ?? pinned)
      }
    }
    const best = await this.deps.catalog.bestVersion(source.provider, source.projectId)
    if (best && best.id !== item.shared?.versionId) item.best = candidateOf(best)

    if (!item.shared && !item.best) {
      const fallback = await this.newestFile(source.provider, source.projectId)
      if (fallback) item.best = candidateOf(fallback)
    }
    if (!item.shared && !item.best) {
      item.status = 'unavailable'
      item.reason = `Nothing to download for ${this.deps.catalog.describeTarget()}`
      return
    }
    item.status = importStatus(item, 'shared')
    if (item.status === 'incompatible') {
      item.reason = `No version for ${this.deps.catalog.describeTarget()}`
    } else if (item.status === 'manual') {
      item.reason = `Download by hand from ${providerLabel[source.provider]}`
    }
  }

  /**
   * The newest file of a project, whatever it was built for. Only asked for when nothing fits, so the
   * user still has the choice of taking the jar and sorting the loader out themselves.
   */
  private async newestFile(
    provider: Provider,
    projectId: string,
  ): Promise<RankedVersion | undefined> {
    const all = await this.deps.catalog.versions(provider, projectId, true).catch(() => [])
    return [...all]
      .filter((v) => v.file)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0]
  }
}

/** One ranked version as the dialog's pick-one-of-two choice sees it. */
function candidateOf(version: RankedVersion | ProjectVersion): ImportCandidate {
  const ranked = 'compatible' in version ? version : undefined
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    size: version.file?.size,
    // Without a file there is nothing to download, so it can't run here whatever the platform says.
    compatible: Boolean(version.file) && (ranked?.compatible ?? false),
    bridge: ranked?.bridge,
    manual: Boolean(version.file && !version.file.url),
    pageUrl: version.pageUrl,
    note: version.file ? ranked?.note : 'No jar to download',
  }
}

interface InstalledIndex {
  bySha1: Map<string, InstalledMod>
  byProject: Map<string, InstalledMod>
}

function installedIndex(mods: readonly InstalledMod[]): InstalledIndex {
  const bySha1 = new Map<string, InstalledMod>()
  const byProject = new Map<string, InstalledMod>()
  for (const m of mods) {
    bySha1.set(m.sha1, m)
    for (const s of m.sources) byProject.set(projectKey(s.provider, s.projectId), m)
  }
  return { bySha1, byProject }
}

function describe(instance: Instance): ModListInstance {
  return {
    kind: instance.kind,
    contentKind: instance.contentKind,
    gameVersion: instance.gameVersion,
    loader: instance.loader,
    loaderVersion: instance.loaderVersion,
    javaVersion: instance.javaVersion,
  }
}

/** One installed jar as a list entry: the platform's title and version when it has one. */
function entryOf(mod: InstalledMod): ModListEntry {
  const source = updateSource(mod)
  return {
    fileName: enabledName(mod.fileName),
    name: source?.title ?? mod.meta?.name ?? mod.meta?.id ?? enabledName(mod.fileName),
    version: installedVersion(mod),
    enabled: mod.enabled,
    side: mod.side,
    size: mod.size,
    sha1: mod.sha1,
    source: source && {
      provider: source.provider,
      projectId: source.projectId,
      versionId: source.versionId,
      versionNumber: source.versionNumber,
      slug: source.slug,
      title: source.title,
      iconUrl: source.iconUrl,
    },
  }
}

function installedVersion(mod: InstalledMod): string | undefined {
  return updateSource(mod)?.versionNumber ?? mod.meta?.version ?? undefined
}

/** The two instances side by side, as the import dialog lists them. */
function compare(from: ModListInstance, to: ModListInstance): ImportCheck[] {
  const loaderLabel = (i: ModListInstance) => (i.loader ? loaderInfo[i.loader].label : null)
  const java = (i: ModListInstance) => (i.javaVersion ? `Java ${i.javaVersion.major}` : null)
  return [
    check('game version', from.gameVersion, to.gameVersion),
    check('loader', loaderLabel(from), loaderLabel(to)),
    check('loader version', from.loaderVersion, to.loaderVersion),
    check('Java', java(from), java(to)),
  ]
}

function check(label: string, theirs: string | null, ours: string | null): ImportCheck {
  return {
    label,
    theirs,
    ours,
    match: theirs === null || ours === null ? 'unknown' : theirs === ours ? 'same' : 'differs',
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
