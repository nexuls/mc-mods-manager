import path from 'node:path'
import {
  type InstalledMod,
  type ModRecord,
  type ModSource,
  type ModSuggestion,
  type ModsResponse,
  type Provider,
  providerLabel,
  type State,
  type UpdateModBody,
} from '@mc-mod/shared'
import type { ConfigService } from '../config'
import { AppError } from '../errors'
import { readLauncherMetadata } from '../instance/launcher-metadata'
import { moveToTrash, renameInside } from '../instance/paths'
import { readState, updateState } from '../instance/state'
import { disabledName, enabledName, type ScannedJar, scanJar, scanJars } from '../jar/scan'
import { CurseForgeKeyError, type CurseForgeProvider } from '../providers/curseforge'
import type { ModrinthProvider } from '../providers/modrinth'
import type { HashMatch, ProjectInfo } from '../providers/types'
import { applyLookup, buildInstalledMod, projectKey } from './identify'
import type { InstanceService } from './instance'
import { type UpdateStore, withUpdate } from './updates'

const SUGGESTION_LIMIT = 6
const CF_SUGGESTION_LIMIT = 4

type Modrinth = Pick<ModrinthProvider, 'identify' | 'getProjects' | 'getProject' | 'search'>
type CurseForge = Pick<
  CurseForgeProvider,
  'enabled' | 'identify' | 'getProjects' | 'getProject' | 'search'
>

export interface LibraryDeps {
  instance: InstanceService
  modrinth: Modrinth
  curseforge: CurseForge
  config: Pick<ConfigService, 'config'>
  /** Results of the last update check, added to every list. */
  updates?: Pick<UpdateStore, 'get'>
  now?: () => number
}

/** One platform's exact-file lookup: the jars it checked and what it found for each (by sha1). */
type LookupResult =
  | { provider: Provider; ok: true; checked: Map<string, HashMatch | undefined> }
  | { provider: Provider; ok: false; warning: string }

/** Installed content: scan, identify (architecture §7.2), enable/disable, remove, link. */
export class LibraryService {
  /** Projects fetched this run (by `projectKey`), for titles/icons of launcher-metadata and manual sources. */
  private readonly projects = new Map<string, ProjectInfo>()
  /** Project keys already requested this run, found or not, so offline runs don't retry every call. */
  private readonly requested = new Set<string>()
  private pendingList: Promise<ModsResponse> | undefined
  private readonly instance: InstanceService
  private readonly modrinth: Modrinth
  private readonly curseforge: CurseForge
  private readonly now: () => number

  constructor(private readonly deps: LibraryDeps) {
    this.instance = deps.instance
    this.modrinth = deps.modrinth
    this.curseforge = deps.curseforge
    this.now = deps.now ?? Date.now
  }

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
    const due = (provider: Provider) =>
      jars.filter((j) => refresh || state.mods?.[j.sha1]?.checkedAt?.[provider] === undefined)

    // Both platforms at once (architecture §7.2 step 3). CurseForge only with a key.
    const results = await Promise.all([
      this.lookup(
        'modrinth',
        due('modrinth'),
        (j) => j.sha1,
        (keys) => this.modrinth.identify(keys),
      ),
      this.curseforge.enabled()
        ? this.lookup(
            'curseforge',
            due('curseforge'),
            (j) => j.cfFingerprint,
            (keys) => this.curseforge.identify(keys),
          )
        : undefined,
    ])

    const reachable = new Set<Provider>(['modrinth', 'curseforge'])
    if (!this.curseforge.enabled()) reachable.delete('curseforge')
    const now = this.now()
    for (const result of results) {
      if (!result) continue
      if (!result.ok) {
        reachable.delete(result.provider)
        warnings.push(result.warning)
        continue
      }
      const ids = [...result.checked.values()].flatMap((m) => (m ? [m.projectId] : []))
      // Only nice to have: without projects the sources just lack titles until the next lookup.
      await this.fetchProjects(result.provider, ids, true).catch(() => {})
      for (const [sha1, match] of result.checked) {
        const project = match
          ? this.projects.get(projectKey(result.provider, match.projectId))
          : undefined
        const before = records.get(sha1) ?? state.mods?.[sha1]
        records.set(sha1, applyLookup(before, result.provider, match, project, now))
      }
    }

    const launcher = await readLauncherMetadata(root, contentDir, jars)
    const recordOf = (sha1: string) => records.get(sha1) ?? state.mods?.[sha1]
    for (const provider of reachable) {
      const missing = jars.flatMap((j) =>
        [...(launcher.get(j.sha1) ?? []), ...manualOf(recordOf(j.sha1))]
          .filter((s) => s.provider === provider && !s.title)
          .map((s) => s.projectId),
      )
      // Only nice to have: a failure just leaves those rows without titles.
      await this.fetchProjects(provider, missing, false).catch(() => {})
    }

    await this.save(root, state, cache, records, jars)
    const inst = this.instance.instance
    return {
      mods: jars.map((jar) =>
        withUpdate(
          buildInstalledMod({
            jar,
            record: recordOf(jar.sha1),
            launcher: launcher.get(jar.sha1) ?? [],
            instance: inst,
            preferred: this.deps.config.config.preferredProvider,
            projects: this.projects,
          }),
          this.deps.updates?.get(jar.sha1),
        ),
      ),
      warnings,
    }
  }

  /**
   * Looks jars up on one platform by `keyOf` (sha1 for Modrinth, fingerprint for CurseForge). Jars
   * sharing a key share the answer. A failed lookup becomes a warning, so the list still loads.
   */
  private async lookup<K>(
    provider: Provider,
    jars: readonly ScannedJar[],
    keyOf: (jar: ScannedJar) => K,
    identify: (keys: K[]) => Promise<Map<K, HashMatch>>,
  ): Promise<LookupResult> {
    const checked = new Map<string, HashMatch | undefined>()
    if (jars.length === 0) return { provider, ok: true, checked }
    try {
      const matches = await identify([...new Set(jars.map(keyOf))])
      for (const j of jars) checked.set(j.sha1, matches.get(keyOf(j)))
      return { provider, ok: true, checked }
    } catch (err) {
      return {
        provider,
        ok: false,
        warning: `${lookupWarning(provider, err)} Showing what was found before.`,
      }
    }
  }

  /** Fetches projects not seen yet this run. `force` refetches ids asked for before. */
  private async fetchProjects(
    provider: Provider,
    ids: readonly string[],
    force: boolean,
  ): Promise<void> {
    const wanted = [...new Set(ids)].filter((id) => {
      const key = projectKey(provider, id)
      return !this.projects.has(key) && (force || !this.requested.has(key))
    })
    if (wanted.length === 0) return
    for (const id of wanted) this.requested.add(projectKey(provider, id))
    const client = provider === 'modrinth' ? this.modrinth : this.curseforge
    for (const [id, p] of await client.getProjects(wanted)) {
      this.projects.set(projectKey(provider, id), p)
    }
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
      const { provider, projectId } = body.link
      if (provider === 'curseforge' && !this.curseforge.enabled()) {
        throw new AppError('PROVIDER_DISABLED', 'Add a CurseForge API key in Settings first.')
      }
      const project =
        provider === 'modrinth'
          ? await this.modrinth.getProject(projectId)
          : await this.curseforge.getProject(projectId, this.instance.instance.contentKind)
      if (!project) {
        throw new AppError('NOT_FOUND', `No ${providerLabel[provider]} project "${projectId}"`)
      }
      this.projects.set(projectKey(provider, project.id), project)
      manual = {
        provider,
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

  /**
   * Projects that might be this jar: same mod id as a slug, then a name search, on Modrinth and (with a
   * key) CurseForge. CurseForge failures are skipped: some keys can't search at all.
   */
  async suggestions(fileName: string): Promise<ModSuggestion[]> {
    const jar = await this.jar(fileName)
    const { contentKind, loader } = this.instance.instance
    const id = jar.meta?.id
    const slug = id && /^[\w.-]+$/.test(id) ? id.replaceAll('_', '-') : undefined
    // Jar names like "Create: Frogport Reworked" can miss where the file name's words hit.
    const queries = [...new Set([jar.meta?.name, id, nameFromFile(fileName)])].filter(
      (q): q is string => Boolean(q?.trim()),
    )

    const find = async (
      provider: Provider,
      client: Pick<Modrinth, 'getProject' | 'search'>,
    ): Promise<ModSuggestion[]> => {
      const out: ModSuggestion[] = []
      const add = (p: ProjectInfo, reason: string) => {
        if (out.some((s) => s.projectId === p.id)) return
        out.push({
          provider,
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
      const bySlug = slug ? await client.getProject(slug) : null
      if (bySlug) add(bySlug, 'Same mod id')
      for (const text of queries) {
        const hits = await client.search({ text, kind: contentKind, loader, limit: 5 })
        for (const h of hits) add(h, 'Name search')
        if (hits.length > 0) break
      }
      return out
    }

    const [modrinth, curseforge] = await Promise.all([
      find('modrinth', this.modrinth),
      this.curseforge.enabled()
        ? find('curseforge', {
            getProject: (idOrSlug) => this.curseforge.getProject(idOrSlug, contentKind),
            search: (q) => this.curseforge.search(q),
          }).catch((err: unknown) => {
            if (err instanceof AppError) return []
            throw err
          })
        : [],
    ])
    return [...modrinth.slice(0, SUGGESTION_LIMIT), ...curseforge.slice(0, CF_SUGGESTION_LIMIT)]
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
function lookupWarning(provider: Provider, err: unknown): string {
  const label = providerLabel[provider]
  if (err instanceof CurseForgeKeyError) return err.message
  if (err instanceof AppError && (err.code === 'PROVIDER_ERROR' || err.code === 'RATE_LIMITED')) {
    return err.code === 'RATE_LIMITED'
      ? `${label} rate limit reached.`
      : `Couldn't reach ${label} to identify new jars.`
  }
  throw err
}
