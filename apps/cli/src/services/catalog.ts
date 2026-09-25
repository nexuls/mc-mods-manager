import {
  type api,
  type Category,
  type ContentKind,
  type Input,
  loaderInfo,
  type Project,
  type ProjectHit,
  type ProjectVersion,
  type Provider,
  providerLabel,
  type RankedVersion,
  SEARCH_PAGE_SIZE,
  type SearchResponse,
} from '@mc-mod/shared'
import type { ConfigService } from '../config'
import { AppError } from '../errors'
import type { CurseForgeProvider } from '../providers/curseforge'
import type { BrowseQuery, ModrinthProvider } from '../providers/modrinth'
import type { BridgeStore } from './bridges'
import type { InstanceService } from './instance'
import { queryLoaders, rankVersions, type VersionContext } from './versions'

type Modrinth = Pick<
  ModrinthProvider,
  'browse' | 'getProjectPage' | 'getVersions' | 'getVersionsByIds' | 'gameVersions' | 'categories'
>
type CurseForge = Pick<
  CurseForgeProvider,
  'browse' | 'getProjectPage' | 'getVersions' | 'getVersionsByIds' | 'categories'
>

type SearchInput = Input<typeof api.projects.search>['query']
type VersionFilter = { loaders?: readonly string[]; gameVersions?: readonly string[] }

/** What the catalog needs from a platform, with the instance's content kind already applied. */
interface Platform {
  browse(q: BrowseQuery): Promise<{ hits: ProjectHit[]; total: number }>
  getProjectPage(id: string): Promise<Project | null>
  getVersions(id: string, filter: VersionFilter): Promise<ProjectVersion[] | null>
  getVersionsByIds(ids: readonly string[]): Promise<Map<string, ProjectVersion>>
  categories(kind: ContentKind): Promise<Category[]>
}

/** Browsing the platforms: search, project pages, versions and tags, filtered to the instance. */
export class CatalogService {
  constructor(
    private readonly instance: InstanceService,
    private readonly modrinth: Modrinth,
    private readonly curseforge: CurseForge,
    private readonly config: Pick<ConfigService, 'config'>,
    /** Compatibility layers installed here; empty until the content dir has been scanned once. */
    private readonly bridges: Pick<BridgeStore, 'list'>,
  ) {}

  /** CurseForge calls fail with PROVIDER_DISABLED on their own while there's no key. */
  private platform(provider: Provider): Platform {
    if (provider === 'modrinth') return this.modrinth
    const cf = this.curseforge
    // CurseForge slugs are only unique within a class, so lookups pass the instance's content kind.
    const kind = () => this.instance.instance.contentKind
    return {
      browse: (q) => cf.browse(q),
      getProjectPage: (id) => cf.getProjectPage(id, kind()),
      getVersions: (id, filter) => cf.getVersions(id, filter, kind()),
      getVersionsByIds: (ids) => cf.getVersionsByIds(ids),
      categories: (k) => cf.categories(k),
    }
  }

  /** The instance's loader, game version and content kind, as version picking needs them. */
  versionContext(): VersionContext {
    const { loader, gameVersion, contentKind } = this.instance.instance
    return {
      loader,
      gameVersion,
      contentKind,
      allowPrerelease: this.config.config.allowPrerelease,
      bridges: this.bridges.list(),
    }
  }

  async search(q: SearchInput): Promise<SearchResponse> {
    const inst = this.instance.instance
    const loader = q.loader ?? inst.loader
    const gameVersion = q.gameVersion ?? inst.gameVersion
    const kind = q.kind ?? inst.contentKind
    // Plugin game versions are minimums, so a version filter would hide plugins that work fine.
    const filters = {
      gameVersion: q.all || kind === 'plugin' ? null : gameVersion,
      loaders: q.all ? [] : queryLoaders({ loader, gameVersion, bridges: this.bridges.list() }),
    }
    const { hits, total } = await this.platform(q.provider).browse({
      text: q.q,
      kind,
      loaders: filters.loaders,
      gameVersion: filters.gameVersion,
      category: q.category,
      sort: q.sort,
      offset: q.page * SEARCH_PAGE_SIZE,
      limit: SEARCH_PAGE_SIZE,
    })
    return { hits, total, page: q.page, pageSize: SEARCH_PAGE_SIZE, filters }
  }

  async project(provider: Provider, id: string): Promise<Project> {
    const project = await this.platform(provider).getProjectPage(id)
    if (!project) throw notFound(provider, id)
    return project
  }

  /**
   * Versions for this loader and game version (plugins: any game version), ranked, newest first.
   * `all` lists every version, still marking which ones fit.
   */
  async versions(provider: Provider, id: string, all: boolean): Promise<RankedVersion[]> {
    const list = await this.ranked(provider, id, all)
    if (!list) throw notFound(provider, id)
    return list
  }

  /** The recommended version of a project, if any fits (or the project doesn't exist). */
  async bestVersion(provider: Provider, id: string): Promise<RankedVersion | undefined> {
    return (await this.ranked(provider, id, false))?.find((v) => v.recommended)
  }

  /** Versions by id; ids the platform doesn't know are missing from the map. */
  versionsByIds(provider: Provider, ids: readonly string[]): Promise<Map<string, ProjectVersion>> {
    return this.platform(provider).getVersionsByIds(ids)
  }

  private async ranked(
    provider: Provider,
    id: string,
    all: boolean,
  ): Promise<RankedVersion[] | null> {
    const ctx = this.versionContext()
    const list = await this.platform(provider).getVersions(
      id,
      all
        ? {}
        : {
            loaders: queryLoaders(ctx, { bridged: true }),
            gameVersions: ctx.contentKind === 'mod' && ctx.gameVersion ? [ctx.gameVersion] : [],
          },
    )
    if (!list) return null
    const ranked = rankVersions(list, ctx)
    // CurseForge filters on one loader at most, so the rest of the filtering happens here.
    return all || provider === 'modrinth' ? ranked : ranked.filter((v) => v.compatible)
  }

  /** `Fabric 1.21.4`, for messages. */
  describeTarget(): string {
    const { loader, gameVersion } = this.instance.instance
    return (
      [loader ? loaderInfo[loader].label : null, gameVersion].filter(Boolean).join(' ') ||
      'this instance'
    )
  }

  /** Game versions always come from Modrinth: it needs no key and the lists match. */
  gameVersions(includeSnapshots: boolean): Promise<string[]> {
    return this.modrinth.gameVersions(includeSnapshots)
  }

  categories(provider: Provider, kind: ContentKind): Promise<Category[]> {
    return this.platform(provider).categories(kind)
  }
}

function notFound(provider: Provider, id: string): AppError {
  return new AppError('NOT_FOUND', `No ${providerLabel[provider]} project "${id}"`)
}
