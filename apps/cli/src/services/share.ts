import {
  type ImportCheck,
  type ImportItem,
  type ImportPlan,
  type InstalledMod,
  type Instance,
  loaderInfo,
  MOD_LIST_FORMAT,
  MOD_LIST_VERSION,
  type ModList,
  type ModListEntry,
  type ModListInstance,
  type ProjectVersion,
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
    'bestVersion' | 'versionsByIds' | 'versionContext' | 'describeTarget'
  >
  curseforge: Pick<CurseForgeProvider, 'enabled'>
  /** The mc-mod version written into exported lists. */
  version: string
  now?: () => number
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
        this.resolve(item, entry, await this.pick(entry))
      } catch (err) {
        if (!(err instanceof AppError)) throw err
        failed++
        item.status = 'unavailable'
        item.reason = err.message
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
   * The version to install: the one in the list when it fits this instance, else the best one for it.
   * Nothing fits → undefined.
   */
  private async pick(entry: ModListEntry): Promise<RankedVersion | ProjectVersion | undefined> {
    const source = entry.source
    if (!source) return undefined
    if (source.versionId) {
      const listed = (
        await this.deps.catalog.versionsByIds(source.provider, [source.versionId])
      ).get(source.versionId)
      const ranked = listed
        ? rankVersions([listed], this.deps.catalog.versionContext())[0]
        : undefined
      if (ranked?.compatible && ranked.projectId === source.projectId) return ranked
    }
    return this.deps.catalog.bestVersion(source.provider, source.projectId)
  }

  /** Fills the item in from the version that was picked (or marks it unavailable). */
  private resolve(
    item: ImportItem,
    entry: ModListEntry,
    version: RankedVersion | ProjectVersion | undefined,
  ): void {
    if (!version) {
      item.status = 'unavailable'
      item.reason = `No version for ${this.deps.catalog.describeTarget()}`
      return
    }
    item.versionId = version.id
    item.versionNumber = version.versionNumber
    item.size = version.file?.size
    if (entry.source?.versionId && version.id !== entry.source.versionId) {
      item.note = `The listed version doesn't fit this instance; ${version.versionNumber} does`
    } else if ('note' in version && version.note) {
      item.note = version.note
    }
    if (version.file && !version.file.url) {
      item.status = 'manual'
      item.pageUrl = version.pageUrl
      item.reason = `Download by hand from ${providerLabel[version.provider]}`
    } else if (!version.file) {
      item.status = 'unavailable'
      item.reason = 'That version has no jar to download'
    }
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
