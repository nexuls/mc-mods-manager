import type { ContentKind, ProjectVersion } from '@mc-mod/shared'
import { AppError } from '../src/errors'
import { CurseForgeKeyError, type CurseForgeProvider } from '../src/providers/curseforge'
import type { HashMatch, ProjectInfo } from '../src/providers/types'

export type FakeCurseForge = Pick<
  CurseForgeProvider,
  | 'enabled'
  | 'testKey'
  | 'identify'
  | 'getProjects'
  | 'getProject'
  | 'getProjectPage'
  | 'getVersions'
  | 'getVersionsByIds'
  | 'browse'
  | 'search'
  | 'categories'
>

/**
 * In-memory CurseForge for service and route tests. `enabled: false` is "no key"; `offline` fails every
 * call like a dead network, `badKey` like a rejected key. Projects have numeric-string ids.
 */
export function fakeCurseForge(
  data: {
    matches?: Record<number, HashMatch>
    projects?: (ProjectInfo & { kind?: ContentKind })[]
    versions?: ProjectVersion[]
    enabled?: boolean
    offline?: boolean
    badKey?: boolean
  } = {},
) {
  const calls = {
    identify: [] as number[][],
    getProjects: [] as string[][],
    search: [] as string[],
  }
  const projects = data.projects ?? []
  const versions = data.versions ?? []
  const fail = () => {
    if (data.enabled === false) throw new AppError('PROVIDER_DISABLED', 'No CurseForge key')
    if (data.badKey) throw new CurseForgeKeyError()
    if (data.offline) throw new AppError('PROVIDER_ERROR', "Can't reach CurseForge")
  }
  const find = (idOrSlug: string, kind: ContentKind = 'mod') =>
    projects.find((p) => p.id === idOrSlug || (p.slug === idOrSlug && (p.kind ?? 'mod') === kind))
  const curseforge: FakeCurseForge = {
    enabled: () => data.enabled !== false,
    async testKey() {
      return { ok: !data.badKey, message: data.badKey ? 'Rejected' : 'The key works.' }
    },
    async identify(fingerprints) {
      fail()
      calls.identify.push([...fingerprints])
      const out = new Map<number, HashMatch>()
      for (const f of fingerprints) {
        const m = data.matches?.[f]
        if (m) out.set(f, m)
      }
      return out
    },
    async getProjects(ids) {
      fail()
      calls.getProjects.push([...ids])
      return new Map(projects.filter((p) => ids.includes(p.id)).map((p) => [p.id, p]))
    },
    async getProject(idOrSlug, kind) {
      fail()
      return find(idOrSlug, kind) ?? null
    },
    async getProjectPage(idOrSlug, kind) {
      fail()
      const p = find(idOrSlug, kind)
      if (!p) return null
      return {
        provider: 'curseforge',
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        body: `<p>${p.title}</p>`,
        iconUrl: p.iconUrl,
        downloads: p.downloads ?? 0,
        categories: [],
        loaders: [],
        gameVersions: [],
        side: 'unknown',
        pageUrl: `https://www.curseforge.com/minecraft/mc-mods/${p.slug}`,
        links: [],
        gallery: [],
      }
    },
    async getVersions(idOrSlug, _filter, kind) {
      fail()
      const p = find(idOrSlug, kind)
      return p ? versions.filter((v) => v.projectId === p.id) : null
    },
    async getVersionsByIds(ids) {
      fail()
      return new Map(versions.filter((v) => ids.includes(v.id)).map((v) => [v.id, v]))
    },
    async browse(q) {
      fail()
      const hits = projects
        .filter((p) => p.title.toLowerCase().includes(q.text.toLowerCase()))
        .map((p) => ({
          provider: 'curseforge' as const,
          id: p.id,
          slug: p.slug,
          title: p.title,
          description: p.description,
          downloads: p.downloads ?? 0,
          categories: [],
          side: 'unknown' as const,
        }))
      return { hits: hits.slice(q.offset, q.offset + q.limit), total: hits.length }
    },
    async search(q) {
      fail()
      calls.search.push(q.text)
      return projects.filter((p) => p.title.toLowerCase().includes(q.text.toLowerCase()))
    },
    async categories() {
      fail()
      return [{ name: 'map-information', label: 'Map and Information' }]
    },
  }
  return { curseforge, calls }
}
