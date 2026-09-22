import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  contentDirName,
  type InstallBody,
  type InstalledMod,
  type ModSource,
  type PlanBody,
  type PlanItem,
  type PlanResponse,
  type PlanRole,
  type ProjectVersion,
  type Provider,
  providerLabel,
  type RankedVersion,
} from '@mc-mod/shared'
import { AppError } from '../errors'
import { renameInside, resolveInside, safeJarName, stateDir } from '../instance/paths'
import { updateState } from '../instance/state'
import { hashBytes } from '../jar/hash'
import { downloadVerified } from '../lib/download'
import type { CurseForgeProvider } from '../providers/curseforge'
import { type ModrinthProvider, USER_AGENT } from '../providers/modrinth'
import type { Fetch, ProjectInfo } from '../providers/types'
import type { CatalogService } from './catalog'
import { projectKey } from './identify'
import type { InstanceService } from './instance'
import type { Job, JobService } from './jobs'
import type { LibraryService } from './library'
import { rankVersions } from './versions'

type Modrinth = Pick<ModrinthProvider, 'getProject' | 'getProjects' | 'getVersionsByIds'>
type CurseForge = Pick<CurseForgeProvider, 'getProject' | 'getProjects' | 'getVersionsByIds'>

/** What installing needs from a platform. */
interface Platform {
  getProject(id: string): Promise<ProjectInfo | null>
  getProjects(ids: readonly string[]): Promise<Map<string, ProjectInfo>>
  getVersionsByIds(ids: readonly string[]): Promise<Map<string, ProjectVersion>>
}

/** Progress events per item are sent at most this often. */
const PROGRESS_INTERVAL_MS = 150

export interface InstallerDeps {
  instance: InstanceService
  library: Pick<LibraryService, 'list'>
  catalog: Pick<CatalogService, 'bestVersion' | 'versionContext' | 'describeTarget'>
  modrinth: Modrinth
  curseforge: CurseForge
  jobs: JobService
  /** Downloads; tests pass a fake. */
  fetch?: Fetch
  now?: () => number
  /** Unexpected errors in a background job, after the item is reported as failed. */
  onInternalError?: (err: unknown) => void
}

/** Stops a runaway dependency chain; real mods need a handful at most. */
const MAX_PLAN_ITEMS = 60

/** Installing: plan (dependencies, what's installed), then download (architecture §7.4, §7.5). */
export class InstallerService {
  private readonly library: InstallerDeps['library']
  private readonly catalog: InstallerDeps['catalog']

  constructor(private readonly deps: InstallerDeps) {
    this.library = deps.library
    this.catalog = deps.catalog
  }

  /** CurseForge calls fail with PROVIDER_DISABLED on their own while there's no key. */
  private platform(provider: Provider): Platform {
    if (provider === 'modrinth') return this.deps.modrinth
    const cf = this.deps.curseforge
    return {
      // Slugs are only unique within a class on CurseForge.
      getProject: (id) => cf.getProject(id, this.deps.instance.instance.contentKind),
      getProjects: (ids) => cf.getProjects(ids),
      getVersionsByIds: (ids) => cf.getVersionsByIds(ids),
    }
  }

  /**
   * Resolves a project and its dependencies without touching disk. Required dependencies are followed
   * recursively; optional ones are listed for the main project only, and aren't followed. Projects that
   * are already installed (by project id on that platform) are listed as `installed` and not followed
   * either. Dependencies are on the same platform as the project.
   */
  async plan(body: PlanBody): Promise<PlanResponse> {
    const { provider } = body
    const platform = this.platform(provider)
    const target = this.catalog.describeTarget()
    const { mods } = await this.library.list()
    const installedMods = new Map<string, InstalledMod>()
    for (const m of mods) {
      for (const s of m.sources) installedMods.set(projectKey(s.provider, s.projectId), m)
    }
    const installed = {
      get: (id: string) => installedMods.get(projectKey(provider, id)),
      has: (id: string) => installedMods.has(projectKey(provider, id)),
    }

    const main = await platform.getProject(body.projectId)
    if (!main) {
      throw new AppError('NOT_FOUND', `No ${providerLabel[provider]} project "${body.projectId}"`)
    }

    const warnings: string[] = []
    let mainVersion: RankedVersion | undefined
    if (body.versionId) {
      const v = (await platform.getVersionsByIds([body.versionId])).get(body.versionId)
      if (!v || v.projectId !== main.id) {
        throw new AppError('NOT_FOUND', `${main.title} has no version "${body.versionId}"`)
      }
      mainVersion = rankVersions([v], this.catalog.versionContext())[0]
      if (mainVersion && !mainVersion.compatible) {
        warnings.push(`${main.title} ${v.versionNumber} isn't made for ${target}.`)
      }
    } else {
      mainVersion = await this.catalog.bestVersion(provider, main.id)
    }

    const items: PlanItem[] = []
    const byProject = new Map<string, PlanItem>()
    const queue: { version: ProjectVersion; item: PlanItem }[] = []
    /** Chosen versions of optional items, in case something requires them later. */
    const optionalVersions = new Map<string, ProjectVersion>()

    const add = (
      project: Pick<ProjectInfo, 'id' | 'slug' | 'title' | 'iconUrl' | 'side'>,
      role: PlanRole,
      version: RankedVersion | undefined,
      requiredBy: string | undefined,
    ): PlanItem => {
      const have = installed.get(project.id)
      const manual = version?.file && !version.file.url
      const item: PlanItem = {
        provider,
        projectId: project.id,
        slug: project.slug || undefined,
        title: project.title,
        iconUrl: project.iconUrl,
        role,
        status: have ? 'installed' : !version ? 'unavailable' : manual ? 'manual' : 'install',
        side: version?.side ?? project.side,
        requiredBy: requiredBy ? [requiredBy] : [],
      }
      if (have) {
        item.reason = `Installed as ${have.fileName}`
      } else if (version) {
        item.versionId = version.id
        item.versionNumber = version.versionNumber
        item.fileName = version.file?.name
        item.size = version.file?.size
        item.note = version.note
        if (manual) {
          item.pageUrl = version.pageUrl
          item.reason = `Download by hand from ${providerLabel[provider]}`
          // The main project's own status says this; a dependency needs the warning.
          if (role === 'required') {
            warnings.push(
              `${project.title}'s author only allows downloads from the ${providerLabel[provider]} website. Download it there and put it in the ${contentDirName[this.deps.instance.instance.contentKind]} folder.`,
            )
          }
        }
        if (role === 'optional') optionalVersions.set(project.id, version)
        else queue.push({ version, item })
      } else {
        item.reason = `No version for ${target}`
        if (role !== 'optional') {
          warnings.push(
            requiredBy
              ? `${project.title} (needed by ${requiredBy}) has no version for ${target}.`
              : `${project.title} has no version for ${target}.`,
          )
        }
      }
      items.push(item)
      byProject.set(project.id, item)
      return item
    }

    add(main, 'main', mainVersion, undefined)

    for (let next = queue.shift(); next; next = queue.shift()) {
      const { version, item: parent } = next
      const deps = await this.resolveDependencyProjects(platform, version)
      const wanted = deps.filter((d) => !byProject.has(d.projectId)).map((d) => d.projectId)
      const projects: ReadonlyMap<string, ProjectInfo> =
        wanted.length > 0 ? await platform.getProjects(wanted) : new Map()

      for (const dep of deps) {
        if (dep.type === 'incompatible') {
          const have = installed.get(dep.projectId)
          const planned = byProject.get(dep.projectId)
          if (have) {
            warnings.push(
              `${parent.title} is incompatible with ${modName(have)}, which is installed.`,
            )
          } else if (planned?.status === 'install') {
            warnings.push(`${parent.title} is incompatible with ${planned.title}.`)
          }
          continue
        }
        if (dep.type === 'optional' && parent.role !== 'main') continue

        const existing = byProject.get(dep.projectId)
        if (existing) {
          if (!existing.requiredBy.includes(parent.title)) existing.requiredBy.push(parent.title)
          const optional = optionalVersions.get(dep.projectId)
          if (dep.type === 'required' && existing.role === 'optional') {
            existing.role = 'required'
            if (optional) queue.push({ version: optional, item: existing })
          }
          continue
        }
        if (items.length >= MAX_PLAN_ITEMS) {
          warnings.push('Stopped following dependencies: the list got too long.')
          queue.length = 0
          break
        }
        const project: ProjectInfo = projects.get(dep.projectId) ?? {
          id: dep.projectId,
          slug: '',
          title: dep.projectId,
          description: '',
          side: 'unknown',
        }
        const version = installed.has(dep.projectId)
          ? undefined
          : await this.catalog.bestVersion(provider, dep.projectId)
        add(project, dep.type, version, parent.title)
      }
    }
    return { items, warnings }
  }

  /**
   * Checks the requested versions, then downloads and installs them one by one in a background job.
   * Returns the job id right away; progress comes as job events.
   */
  async install(body: InstallBody): Promise<{ jobId: string }> {
    const versions = new Map<string, ProjectVersion>()
    const projects = new Map<string, ProjectInfo>()
    for (const provider of new Set(body.items.map((i) => i.provider))) {
      const platform = this.platform(provider)
      const ids = body.items.filter((i) => i.provider === provider).map((i) => i.versionId)
      for (const [id, v] of await platform.getVersionsByIds(ids)) {
        versions.set(projectKey(provider, id), v)
      }
      // Titles and icons for the install records; only nice to have.
      const found = await platform
        .getProjects(
          [...versions.values()].filter((v) => v.provider === provider).map((v) => v.projectId),
        )
        .catch(() => new Map<string, ProjectInfo>())
      for (const [id, p] of found) projects.set(projectKey(provider, id), p)
    }
    const list = body.items.map((item) => {
      const version = versions.get(projectKey(item.provider, item.versionId))
      if (!version || version.projectId !== item.projectId) {
        throw new AppError('NOT_FOUND', `Version ${item.versionId} of ${item.projectId} not found`)
      }
      return version
    })

    const job = this.deps.jobs.create()
    void this.run(job, list, projects)
    return { jobId: job.id }
  }

  private async run(
    job: Job,
    versions: readonly ProjectVersion[],
    projects: ReadonlyMap<string, ProjectInfo>,
  ): Promise<void> {
    let installed = 0
    let failed = 0
    for (const [index, version] of versions.entries()) {
      try {
        const project = projects.get(projectKey(version.provider, version.projectId))
        const done = await this.installOne(job, index, version, project)
        job.emit({ type: 'item-done', index, ...done })
        installed++
      } catch (err) {
        failed++
        if (err instanceof AppError) {
          job.emit({ type: 'item-failed', index, code: err.code, message: err.message })
        } else {
          this.deps.onInternalError?.(err)
          job.emit({ type: 'item-failed', index, code: 'INTERNAL', message: 'Install failed' })
        }
      }
    }
    job.emit({ type: 'done', installed, failed })
    this.deps.jobs.finish(job)
  }

  /**
   * Downloads to `.mc-mod/tmp/`, verifies the hashes, then renames into the content dir. Never replaces
   * a file: the same bytes already there count as installed, anything else is a CONFLICT.
   */
  private async installOne(
    job: Job,
    index: number,
    version: ProjectVersion,
    project: ProjectInfo | undefined,
  ): Promise<{ fileName: string; skipped: boolean }> {
    const { root, contentDir } = this.deps.instance.instance
    const { file } = version
    if (!file) throw new AppError('NOT_FOUND', `${version.name} has no jar file to install`)
    const fileName = safeJarName(file.name)
    const url = file.url
    if (!url) {
      throw new AppError(
        'MANUAL_DOWNLOAD_REQUIRED',
        `The author only allows downloading ${fileName} from the ${providerLabel[version.provider]} website`,
        { pageUrl: version.pageUrl },
      )
    }
    const dest = resolveInside(root, path.join(contentDir, fileName))

    if (await exists(`${dest}.disabled`)) {
      throw new AppError('CONFLICT', `${fileName} is already installed, but disabled`)
    }
    if (await exists(dest)) {
      const { sha1 } = hashBytes(await Bun.file(dest).bytes())
      if (file.sha1 && sha1 === file.sha1.toLowerCase()) {
        await this.record(sha1, version, project)
        return { fileName, skipped: true }
      }
      throw new AppError('CONFLICT', `A different ${fileName} is already in the folder`)
    }

    const tmp = resolveInside(root, path.join(stateDir(root), 'tmp', `${crypto.randomUUID()}.jar`))
    let last = 0
    try {
      const { sha1 } = await downloadVerified(
        {
          url,
          sha1: file.sha1,
          sha512: file.sha512,
          size: file.size,
          file: tmp,
          headers: { 'User-Agent': USER_AGENT },
          onProgress: (received, total) => {
            const now = Date.now()
            if (now - last < PROGRESS_INTERVAL_MS && received !== total) return
            last = now
            job.emit({ type: 'progress', index, received, total })
          },
        },
        this.deps.fetch ?? ((url, init) => globalThis.fetch(url, init)),
      )
      await renameInside(root, tmp, dest)
      await this.record(sha1, version, project)
      return { fileName, skipped: false }
    } finally {
      await rm(tmp, { force: true })
    }
  }

  /** Writes the install record (architecture §7.2 #1), so the file is identified offline. */
  private async record(
    sha1: string,
    version: ProjectVersion,
    project: ProjectInfo | undefined,
  ): Promise<void> {
    const source: ModSource = {
      provider: version.provider,
      projectId: version.projectId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      slug: project?.slug,
      title: project?.title,
      iconUrl: project?.iconUrl,
      loaders: version.loaders,
      gameVersions: version.gameVersions,
      side: version.side ?? (project?.side === 'unknown' ? undefined : project?.side),
      method: 'install-record',
    }
    const now = (this.deps.now ?? Date.now)()
    await updateState(this.deps.instance.instance.root, (s) => {
      const r = s.mods?.[sha1]
      return {
        ...s,
        mods: {
          ...s.mods,
          [sha1]: {
            ...r,
            sources: [...(r?.sources ?? []).filter((x) => x.provider !== source.provider), source],
            checkedAt: { ...r?.checkedAt, [source.provider]: now },
          },
        },
      }
    })
  }

  /** A version's non-embedded dependencies, with the project id looked up for version-only ones. */
  private async resolveDependencyProjects(
    platform: Platform,
    version: ProjectVersion,
  ): Promise<{ projectId: string; type: 'required' | 'optional' | 'incompatible' }[]> {
    const deps = version.dependencies.filter((d) => d.type !== 'embedded')
    const versionOnly = deps.flatMap((d) => (!d.projectId && d.versionId ? [d.versionId] : []))
    const byVersion: ReadonlyMap<string, ProjectVersion> =
      versionOnly.length > 0 ? await platform.getVersionsByIds(versionOnly) : new Map()
    return deps.flatMap((d) => {
      const projectId = d.projectId ?? (d.versionId ? byVersion.get(d.versionId)?.projectId : null)
      if (!projectId || projectId === version.projectId || d.type === 'embedded') return []
      return [{ projectId, type: d.type }]
    })
  }
}

function modName(m: InstalledMod): string {
  return m.sources[0]?.title ?? m.meta?.name ?? m.fileName
}

async function exists(file: string): Promise<boolean> {
  return (await stat(file).catch(() => null)) !== null
}
