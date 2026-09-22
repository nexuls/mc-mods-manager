import { Provider, type SearchQuery, SearchSort } from '@mc-mod/shared'
import { z } from 'zod'

// Browse state lives in the URL (?provider=&q=&sort=&category=&all=1&page=), so back/forward and reloads
// keep it.

const BrowseParams = z.object({
  provider: Provider.catch('modrinth'),
  q: z.string().max(200).catch(''),
  sort: SearchSort.catch('relevance'),
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional()
    .catch(undefined),
  all: z
    .literal('1')
    .optional()
    .catch(undefined)
    .transform((v) => v === '1'),
  page: z.coerce.number().int().min(0).max(500).catch(0),
})
export type BrowseState = z.output<typeof BrowseParams>

export function parseBrowseParams(params: URLSearchParams): BrowseState {
  // Every field has a fallback, so this never fails; missing params come in as undefined.
  return BrowseParams.parse({
    provider: params.get('provider') ?? undefined,
    q: params.get('q') ?? undefined,
    sort: params.get('sort') ?? undefined,
    category: params.get('category') ?? undefined,
    all: params.get('all') ?? undefined,
    page: params.get('page') ?? undefined,
  })
}

/** Back to URL params, leaving defaults out. */
export function toBrowseParams(s: BrowseState): URLSearchParams {
  const out = new URLSearchParams()
  if (s.provider !== 'modrinth') out.set('provider', s.provider)
  if (s.q) out.set('q', s.q)
  if (s.sort !== 'relevance') out.set('sort', s.sort)
  if (s.category) out.set('category', s.category)
  if (s.all) out.set('all', '1')
  if (s.page > 0) out.set('page', String(s.page))
  return out
}

export function toSearchQuery(s: BrowseState): SearchQuery {
  return {
    provider: s.provider,
    q: s.q,
    sort: s.sort,
    category: s.category,
    all: s.all,
    page: s.page,
  }
}

/** The Browse page for a provider, e.g. to go back from a project page. */
export function browseHref(provider: Provider): string {
  return provider === 'modrinth' ? '/browse' : `/browse?provider=${provider}`
}
