import path from 'node:path'
import type {
  InstalledMod,
  ModRecord,
  ModSource,
  ModSuggestion,
  ModsResponse,
  Provider,
  State,
  UpdateModBody,
} from '@mc-mod/shared'
import { AppError } from '../errors'
import { readLauncherMetadata } from '../instance/launcher-metadata'
import { moveToTrash, renameInside } from '../instance/paths'
import { readState, updateState } from '../instance/state'
import { disabledName, enabledName, type ScannedJar, scanJar, scanJars } from '../jar/scan'
import type { ModrinthProvider } from '../providers/modrinth'
import type { ProjectInfo } from '../providers/types'
import { applyLookup, buildInstalledMod } from './identify'
import type { InstanceService } from './instance'

/** Until settings exist (Phase 6), Modrinth is the preferred provider. */
const PREFERRED: Provider = 'modrinth'
const SUGGESTION_LIMIT = 6

type Modrinth = Pick<ModrinthProvider, 'identify' | 'getProjects' | 'getProject' | 'search'>

/** Installed content: scan, identify (architecture §7.2), enable/disable, remove, link. */
export class LibraryService {
  /** Modrinth projects fetched this run, for titles/icons of launcher-metadata and manual sources. */
  private readonly projects = new Map<string, ProjectInfo>()
  /** Project ids already requested this run, found or not, so offline runs don't retry every call. */
  private readonly requested = new Set<string>()
  private pendingList: Promise<ModsResponse> | undefined

  constructor(
    private readonly instance: InstanceService,
    private readonly modrinth: Modrinth,
    private readonly now: () => number = Date.now,
  ) {}

  /** Lists the content dir. Jars never looked up are identified; `refresh` looks every jar up again. */
  list(options: { refresh?: boolean } = {}): Promise<ModsResponse> {
    // The UI may ask twice at once (mount + focus); share one scan and one lookup.
    if (!options.refresh && this.pendingList) return this.pendingList
    const run = this.scanAndIdentify(options.refresh ?? false)
    if (!options.refresh) {
      this.pendingList = run
      const clear = () => {
        if (this.pendingList === run) this.pendingList = undefined
      }
      run.then(clear, clear)
    }
    return run
  }

  private async scanAndIdentify(refresh: boolean): Promise<ModsResponse> {
    const { root, contentDir } = this.instance.instance
    const { state } = await readState(root)
    const { jars, cache } = await scanJars(contentDir, state.jarCache)
    const warnings: string[] = []
    const records = new Map<string, ModRecord>()

    const toCheck = jars
      .map((j) => j.sha1)
      .filter((sha1) => refresh || state.mods?.[sha1]?.checkedAt?.modrinth === undefined)
    let online = true
    if (toCheck.length > 0) {
      try {
        const matches = await this.modrinth.identify(toCheck)
        await this.fetchProjects(
          [...matches.values()].map((m) => m.projectId),
          true,
        )
        const now = this.now()
        for (const sha1 of new Set(toCheck)) {
          const match = matches.get(sha1)
          const project = match ? this.projects.get(match.projectId) : undefined
          records.set(sha1, applyLookup(state.mods?.[sha1], 'modrinth', match, project, now))
        }
      } catch (err) {
        online = false
        warnings.push(`${lookupWarning(err)} Showing what was found before.`)
      }
    }

    const launcher = await readLauncherMetadata(root, contentDir, jars)
    const recordOf = (sha1: string) => records.get(sha1) ?? state.mods?.[sha1]
    if (online) {
      const missing = jars.flatMap((j) =>
        [...(launcher.get(j.sha1) ?? []), ...manualOf(recordOf(j.sha1))]
          .filter((s) => s.provider === 'modrinth' && !s.title)
          .map((s) => s.projectId),
      )
      // Only nice to have: a failure just leaves those rows without titles.
      await this.fetchProjects(missing, false).catch(() => {})
    }

    await this.save(root, state, cache, records, jars)
    const inst = this.instance.instance
    return {
      mods: jars.map((jar) =>
        buildInstalledMod({
          jar,
          record: recordOf(jar.sha1),
          launcher: launcher.get(jar.sha1) ?? [],
          instance: inst,
          preferred: PREFERRED,
          projects: this.projects,
        }),
      ),
      warnings,
    }
  }

  /** Fetches Modrinth projects not seen yet this run. `force` refetches ids asked for before. */
  private async fetchProjects(ids: readonly string[], force: boolean): Promise<void> {
    const wanted = [...new Set(ids)].filter(
      (id) => !this.projects.has(id) && (force || !this.requested.has(id)),
    )
    if (wanted.length === 0) return
    for (const id of wanted) this.requested.add(id)
    for (const [id, p] of await this.modrinth.getProjects(wanted)) this.projects.set(id, p)
  }

  /**
   * Saves the jar cache and new lookup results. Records of files that are gone are dropped unless
   * they hold something the user chose (link, side, provider), which should survive a re-add.
   */
  private async save(
    root: string,
    before: State,
    cache: State['jarCache'],
    records: ReadonlyMap<string, ModRecord>,
    jars: readonly ScannedJar[],
  ): Promise<void> {
    const present = new Set(jars.map((j) => j.sha1))
    const stale = Object.entries(before.mods ?? {}).some(
      ([sha1, r]) => !present.has(sha1) && !hasUserData(r),
    )
    const cacheChanged = JSON.stringify(cache) !== JSON.stringify(before.jarCache)
    if (records.size === 0 && !stale && !cacheChanged) return

    await updateState(root, (s) => {
      const mods: Record<string, ModRecord> = {}
      for (const [sha1, r] of Object.entries(s.mods ?? {})) {
        if (present.has(sha1) || hasUserData(r)) mods[sha1] = r
      }
      for (const [sha1, r] of records) {
        // Keep user choices made while the lookup ran; take only the lookup's fields.
        mods[sha1] = { ...mods[sha1], sources: r.sources, checkedAt: r.checkedAt }
      }
      return { ...s, jarCache: cache, mods }
    })
  }

  /** Finds a jar by its current file name, or throws NOT_FOUND. */
  private async jar(fileName: string): Promise<ScannedJar> {
    const { root, contentDir } = this.instance.instance
    const { state } = await readState(root)
    const jar = await scanJar(contentDir, fileName, state.jarCache)
    if (!jar) throw new AppError('NOT_FOUND', `${fileName} is not in ${path.basename(contentDir)}/`)
    return jar
  }

  async update(fileName: string, body: UpdateModBody): Promise<InstalledMod> {
    const { root, contentDir } = this.instance.instance
    const jar = await this.jar(fileName)

    let manual: ModSource | undefined
    if (body.link) {
      if (body.link.provider !== 'modrinth') {
        throw new AppError('PROVIDER_DISABLED', 'Linking to CurseForge needs CurseForge support.')
      }
      const project = await this.modrinth.getProject(body.link.projectId)
      if (!project) throw new AppError('NOT_FOUND', `No Modrinth project "${body.link.projectId}"`)
      this.projects.set(project.id, project)
      manual = {
        provider: 'modrinth',
        projectId: project.id,
        slug: project.slug,
        title: project.title,
        iconUrl: project.iconUrl,
        side: project.side === 'unknown' ? undefined : project.side,
        method: 'manual',
      }
    }

    let current = fileName
    if (body.enabled !== undefined) {
      const target = body.enabled ? enabledName(fileName) : disabledName(fileName)
      if (target !== fileName) {
        await renameInside(root, path.join(contentDir, fileName), path.join(contentDir, target))
        current = target
      }
    }

    const touchesRecord =
      body.sideOverride !== undefined ||
      body.primarySource !== undefined ||
      body.link !== undefined ||
      body.unlinked !== undefined
    if (touchesRecord) {
      await updateState(root, (s) => {
        const r: ModRecord = { ...s.mods?.[jar.sha1] }
        if (body.sideOverride !== undefined) r.sideOverride = body.sideOverride ?? undefined
        if (body.primarySource !== undefined) r.primarySource = body.primarySource ?? undefined
        if (body.link !== undefined) {
          r.manual = manual
          if (manual) r.unlinked = undefined
        }
        if (body.unlinked !== undefined) r.unlinked = body.unlinked || undefined
        return { ...s, mods: { ...s.mods, [jar.sha1]: r } }
      })
    }

    // Not list(): a list that started before this change would return stale data.
    const mod = (await this.scanAndIdentify(false)).mods.find((m) => m.fileName === current)
    if (!mod) throw new AppError('NOT_FOUND', `${current} disappeared while it was being updated`)
    return mod
  }

  async remove(fileName: string): Promise<{ fileName: string; trashPath: string }> {
    const { root, contentDir } = this.instance.instance
    await this.jar(fileName)
    const dest = await moveToTrash(root, path.join(contentDir, fileName), this.now())
    return { fileName, trashPath: path.relative(root, dest) }
  }

  /** Modrinth projects that might be this jar: same mod id as a slug, then a name search. */
  async suggestions(fileName: string): Promise<ModSuggestion[]> {
    const jar = await this.jar(fileName)
    const { contentKind, loader } = this.instance.instance
    const out: ModSuggestion[] = []
    const add = (p: ProjectInfo, reason: string) => {
      if (out.some((s) => s.projectId === p.id)) return
      out.push({
        provider: 'modrinth',
        projectId: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        iconUrl: p.iconUrl,
        author: p.author,
        downloads: p.downloads,
        reason,
      })
    }

    const id = jar.meta?.id
    if (id && /^[\w.-]+$/.test(id)) {
      const bySlug = await this.modrinth.getProject(id.replaceAll('_', '-'))
      if (bySlug) add(bySlug, 'Same mod id')
    }
    // Jar names like "Create: Frogport Reworked" can miss where the file name's words hit.
    const queries = [...new Set([jar.meta?.name, id, nameFromFile(fileName)])].filter(
      (q): q is string => Boolean(q?.trim()),
    )
    for (const text of queries) {
      const hits = await this.modrinth.search({ text, kind: contentKind, loader, limit: 5 })
      for (const h of hits) add(h, 'Name search')
      if (hits.length > 0) break
    }
    return out.slice(0, SUGGESTION_LIMIT)
  }
}

function manualOf(r: ModRecord | undefined): ModSource[] {
  return r?.manual ? [r.manual] : []
}

function hasUserData(r: ModRecord): boolean {
  return Boolean(r.manual || r.unlinked || r.sideOverride || r.primarySource)
}

/** `sodium-fabric-0.6.0+mc1.21.jar` → `sodium fabric`: the words before the first version-like part. */
export function nameFromFile(fileName: string): string {
  const base = enabledName(fileName).replace(/\.jar$/i, '')
  const words = base.split(/[-_ +]+/)
  const cut = words.findIndex((w) => /^v?\d/.test(w) || /^mc\d/i.test(w))
  return (cut === -1 ? words : words.slice(0, cut)).join(' ').trim()
}

/** The warning for a failed lookup. Anything but a provider error is a bug and is rethrown. */
function lookupWarning(err: unknown): string {
  if (err instanceof AppError && (err.code === 'PROVIDER_ERROR' || err.code === 'RATE_LIMITED')) {
    return err.code === 'RATE_LIMITED'
      ? 'Modrinth rate limit reached.'
      : "Couldn't reach Modrinth to identify new jars."
  }
  throw err
}
