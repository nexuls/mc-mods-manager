import {
  type api,
  type Category,
  type ContentKind,
  type Input,
  loaderInfo,
  type Project,
  type Provider,
  type RankedVersion,
  SEARCH_PAGE_SIZE,
  type SearchResponse,
} from '@mc-mod/shared'
import { AppError } from '../errors'
import type { ModrinthProvider } from '../providers/modrinth'
import type { InstanceService } from './instance'
import { queryLoaders, rankVersions, type VersionContext } from './versions'

type Modrinth = Pick<
  ModrinthProvider,
  'browse' | 'getProjectPage' | 'getVersions' | 'gameVersions' | 'categories'
>

type SearchInput = Input<typeof api.projects.search>['query']

/** Until settings exist (Phase 6), pre-releases only win when there's no release. */
const ALLOW_PRERELEASE = false

/** CurseForge needs an API key and comes with Phase 6. */
export function requireModrinth(provider: Provider): void {
  if (provider !== 'modrinth') {
    throw new AppError(
      'PROVIDER_DISABLED',
      'CurseForge needs an API key, which comes with Settings.',
    )
  }
}

/** Browsing the platforms: search, project pages, versions and tags, filtered to the instance. */
export class CatalogService {
  constructor(
    private readonly instance: InstanceService,
    private readonly modrinth: Modrinth,
  ) {}

  /** The instance's loader, game version and content kind, as version picking needs them. */
  versionContext(): VersionContext {
    const { loader, gameVersion, contentKind } = this.instance.instance
    return { loader, gameVersion, contentKind, allowPrerelease: ALLOW_PRERELEASE }
  }

  async search(q: SearchInput): Promise<SearchResponse> {
    requireModrinth(q.provider)
    const inst = this.instance.instance
    const loader = q.loader ?? inst.loader
    const gameVersion = q.gameVersion ?? inst.gameVersion
    const kind = q.kind ?? inst.contentKind
    // Plugin game versions are minimums, so a version filter would hide plugins that work fine.
    const filters = {
      gameVersion: q.all || kind === 'plugin' ? null : gameVersion,
      loaders: q.all ? [] : queryLoaders({ loader, gameVersion }),
    }
    const { hits, total } = await this.modrinth.browse({
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
    requireModrinth(provider)
    const project = await this.modrinth.getProjectPage(id)
    if (!project) throw new AppError('NOT_FOUND', `No Modrinth project "${id}"`)
    return project
  }

  /**
   * Versions for this loader and game version (plugins: any game version), ranked, newest first.
   * `all` lists every version, still marking which ones fit.
   */
  async versions(provider: Provider, id: string, all: boolean): Promise<RankedVersion[]> {
    requireModrinth(provider)
    const list = await this.ranked(id, all)
    if (!list) throw new AppError('NOT_FOUND', `No Modrinth project "${id}"`)
    return list
  }

  /** The recommended version of a Modrinth project, if any fits (or the project doesn't exist). */
  async bestVersion(id: string): Promise<RankedVersion | undefined> {
    return (await this.ranked(id, false))?.find((v) => v.recommended)
  }

  private async ranked(id: string, all: boolean): Promise<RankedVersion[] | null> {
    const ctx = this.versionContext()
    const list = await this.modrinth.getVersions(
      id,
      all
        ? {}
        : {
            loaders: queryLoaders(ctx),
            gameVersions: ctx.contentKind === 'mod' && ctx.gameVersion ? [ctx.gameVersion] : [],
          },
    )
    return list ? rankVersions(list, ctx) : null
  }

  /** `Fabric 1.21.4`, for messages. */
  describeTarget(): string {
    const { loader, gameVersion } = this.instance.instance
    return (
      [loader ? loaderInfo[loader].label : null, gameVersion].filter(Boolean).join(' ') ||
      'this instance'
    )
  }

  gameVersions(includeSnapshots: boolean): Promise<string[]> {
    return this.modrinth.gameVersions(includeSnapshots)
  }

  categories(kind: ContentKind): Promise<Category[]> {
    return this.modrinth.categories(kind)
  }
}
