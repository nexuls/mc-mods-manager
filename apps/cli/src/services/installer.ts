import type {
  InstalledMod,
  PlanBody,
  PlanItem,
  PlanResponse,
  PlanRole,
  ProjectVersion,
  RankedVersion,
} from '@mc-mod/shared'
import { AppError } from '../errors'
import type { ModrinthProvider } from '../providers/modrinth'
import type { ProjectInfo } from '../providers/types'
import { type CatalogService, requireModrinth } from './catalog'
import type { LibraryService } from './library'
import { rankVersions } from './versions'

type Modrinth = Pick<ModrinthProvider, 'getProject' | 'getProjects' | 'getVersionsByIds'>

/** Stops a runaway dependency chain; real mods need a handful at most. */
const MAX_PLAN_ITEMS = 60

/** Installing: plan (dependencies, what's installed), then download (architecture §7.4, §7.5). */
export class InstallerService {
  constructor(
    private readonly library: Pick<LibraryService, 'list'>,
    private readonly catalog: Pick<
      CatalogService,
      'bestVersion' | 'versionContext' | 'describeTarget'
    >,
    private readonly modrinth: Modrinth,
  ) {}

  /**
   * Resolves a project and its dependencies without touching disk. Required dependencies are followed
   * recursively; optional ones are listed for the main project only, and aren't followed. Projects that
   * are already installed (by Modrinth project id) are listed as `installed` and not followed either.
   */
  async plan(body: PlanBody): Promise<PlanResponse> {
    requireModrinth(body.provider)
    const target = this.catalog.describeTarget()
    const { mods } = await this.library.list()
    const installed = new Map<string, InstalledMod>()
    for (const m of mods) {
      for (const s of m.sources) if (s.provider === 'modrinth') installed.set(s.projectId, m)
    }

    const main = await this.modrinth.getProject(body.projectId)
    if (!main) throw new AppError('NOT_FOUND', `No Modrinth project "${body.projectId}"`)

    const warnings: string[] = []
    let mainVersion: RankedVersion | undefined
    if (body.versionId) {
      const v = (await this.modrinth.getVersionsByIds([body.versionId])).get(body.versionId)
      if (!v || v.projectId !== main.id) {
        throw new AppError('NOT_FOUND', `${main.title} has no version "${body.versionId}"`)
      }
      mainVersion = rankVersions([v], this.catalog.versionContext())[0]
      if (mainVersion && !mainVersion.compatible) {
        warnings.push(`${main.title} ${v.versionNumber} isn't made for ${target}.`)
      }
    } else {
      mainVersion = await this.catalog.bestVersion(main.id)
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
      const item: PlanItem = {
        provider: 'modrinth',
        projectId: project.id,
        slug: project.slug || undefined,
        title: project.title,
        iconUrl: project.iconUrl,
        role,
        status: have ? 'installed' : version ? 'install' : 'unavailable',
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
      const deps = await this.resolveDependencyProjects(version)
      const wanted = deps.filter((d) => !byProject.has(d.projectId)).map((d) => d.projectId)
      const projects: ReadonlyMap<string, ProjectInfo> =
        wanted.length > 0 ? await this.modrinth.getProjects(wanted) : new Map()

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
          : await this.catalog.bestVersion(dep.projectId)
        add(project, dep.type, version, parent.title)
      }
    }
    return { items, warnings }
  }

  /** A version's non-embedded dependencies, with the project id looked up for version-only ones. */
  private async resolveDependencyProjects(
    version: ProjectVersion,
  ): Promise<{ projectId: string; type: 'required' | 'optional' | 'incompatible' }[]> {
    const deps = version.dependencies.filter((d) => d.type !== 'embedded')
    const versionOnly = deps.flatMap((d) => (!d.projectId && d.versionId ? [d.versionId] : []))
    const byVersion: ReadonlyMap<string, ProjectVersion> =
      versionOnly.length > 0 ? await this.modrinth.getVersionsByIds(versionOnly) : new Map()
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
