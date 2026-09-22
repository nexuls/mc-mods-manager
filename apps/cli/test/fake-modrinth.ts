import type { Project, ProjectHit, ProjectVersion } from '@mc-mod/shared'
import { AppError } from '../src/errors'
import type { ModrinthProvider } from '../src/providers/modrinth'
import type { HashMatch, ProjectInfo } from '../src/providers/types'

export type FakeModrinth = Pick<
  ModrinthProvider,
  | 'identify'
  | 'getProjects'
  | 'getProject'
  | 'search'
  | 'browse'
  | 'getProjectPage'
  | 'getVersions'
  | 'getVersionsByIds'
  | 'gameVersions'
  | 'categories'
>

const hitOf = (p: ProjectInfo): ProjectHit => ({
  provider: 'modrinth',
  id: p.id,
  slug: p.slug,
  title: p.title,
  description: p.description,
  iconUrl: p.iconUrl,
  author: p.author,
  downloads: p.downloads ?? 0,
  categories: [],
  side: p.side,
})

const pageOf = (p: ProjectInfo): Project => ({
  provider: 'modrinth',
  id: p.id,
  slug: p.slug,
  title: p.title,
  description: p.description,
  iconUrl: p.iconUrl,
  downloads: p.downloads ?? 0,
  categories: [],
  side: p.side,
  body: `# ${p.title}`,
  loaders: [],
  gameVersions: [],
  pageUrl: `https://modrinth.com/project/${p.slug}`,
  links: [],
  gallery: [],
})

/**
 * In-memory Modrinth for service and route tests. `offline` makes every call fail like a dead network.
 * Versions are matched to projects by `projectId`; `getVersions` applies loader/game version filters.
 */
export function fakeModrinth(
  data: {
    matches?: Record<string, HashMatch>
    projects?: ProjectInfo[]
    versions?: ProjectVersion[]
    offline?: boolean
  } = {},
) {
  const calls = {
    identify: [] as string[][],
    getProjects: [] as string[][],
    search: [] as string[],
    browse: [] as Parameters<ModrinthProvider['browse']>[0][],
    getVersions: [] as { id: string; filter: Parameters<ModrinthProvider['getVersions']>[1] }[],
  }
  const projects = data.projects ?? []
  const versions = data.versions ?? []
  const fail = () => {
    if (data.offline) throw new AppError('PROVIDER_ERROR', "Can't reach Modrinth")
  }
  const find = (idOrSlug: string) => projects.find((p) => p.id === idOrSlug || p.slug === idOrSlug)
  const modrinth: FakeModrinth = {
    async identify(sha1s) {
      fail()
      calls.identify.push([...sha1s])
      const out = new Map<string, HashMatch>()
      for (const s of sha1s) {
        const m = data.matches?.[s]
        if (m) out.set(s, m)
      }
      return out
    },
    async getProjects(ids) {
      fail()
      calls.getProjects.push([...ids])
      return new Map(projects.filter((p) => ids.includes(p.id)).map((p) => [p.id, p]))
    },
    async getProject(idOrSlug) {
      fail()
      return find(idOrSlug) ?? null
    },
    async search(q) {
      fail()
      calls.search.push(q.text)
      return projects.filter((p) => p.title.toLowerCase().includes(q.text.toLowerCase()))
    },
    async browse(q) {
      fail()
      calls.browse.push(q)
      const hits = projects
        .filter((p) => p.title.toLowerCase().includes(q.text.toLowerCase()))
        .map(hitOf)
      return { hits: hits.slice(q.offset, q.offset + q.limit), total: hits.length }
    },
    async getProjectPage(idOrSlug) {
      fail()
      const p = find(idOrSlug)
      return p ? pageOf(p) : null
    },
    async getVersions(idOrSlug, filter = {}) {
      fail()
      calls.getVersions.push({ id: idOrSlug, filter })
      const p = find(idOrSlug)
      if (!p) return null
      return versions.filter(
        (v) =>
          v.projectId === p.id &&
          (!filter.loaders?.length || v.loaders.some((l) => filter.loaders?.includes(l))) &&
          (!filter.gameVersions?.length ||
            v.gameVersions.some((g) => filter.gameVersions?.includes(g))),
      )
    },
    async getVersionsByIds(ids) {
      fail()
      return new Map(versions.filter((v) => ids.includes(v.id)).map((v) => [v.id, v]))
    },
    async gameVersions(includeSnapshots) {
      fail()
      return includeSnapshots ? ['1.21.4', '24w14a', '1.21.1'] : ['1.21.4', '1.21.1']
    },
    async categories(kind) {
      fail()
      return kind === 'mod' ? [{ name: 'optimization', label: 'Optimization' }] : []
    },
  }
  return { modrinth, calls }
}
