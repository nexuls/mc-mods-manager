import { AppError } from '../src/errors'
import type { ModrinthProvider } from '../src/providers/modrinth'
import type { HashMatch, ProjectInfo } from '../src/providers/types'

type Modrinth = Pick<ModrinthProvider, 'identify' | 'getProjects' | 'getProject' | 'search'>

/** In-memory Modrinth for service and route tests. `offline` makes every call fail like a dead network. */
export function fakeModrinth(
  data: { matches?: Record<string, HashMatch>; projects?: ProjectInfo[]; offline?: boolean } = {},
) {
  const calls = {
    identify: [] as string[][],
    getProjects: [] as string[][],
    search: [] as string[],
  }
  const projects = data.projects ?? []
  const fail = () => {
    if (data.offline) throw new AppError('PROVIDER_ERROR', "Can't reach Modrinth")
  }
  const modrinth: Modrinth = {
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
      return projects.find((p) => p.id === idOrSlug || p.slug === idOrSlug) ?? null
    },
    async search(q) {
      fail()
      calls.search.push(q.text)
      return projects.filter((p) => p.title.toLowerCase().includes(q.text.toLowerCase()))
    },
  }
  return { modrinth, calls }
}
