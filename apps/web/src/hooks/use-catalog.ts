import { api, type ContentKind, type Provider, type SearchQuery } from '@mc-mod/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { call } from '@/lib/api'

export function useSearch(query: SearchQuery, enabled = true) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => call(api.projects.search, { query }),
    enabled,
    // Keep the old results on screen while the next page or query loads.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useCategories(kind: ContentKind, provider: Provider, enabled = true) {
  return useQuery({
    queryKey: ['categories', provider, kind],
    queryFn: () => call(api.meta.categories, { query: { kind, provider } }),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useProject(provider: Provider, id: string) {
  return useQuery({
    queryKey: ['project', provider, id],
    queryFn: () => call(api.projects.project, { params: { provider, id } }),
    staleTime: 5 * 60_000,
  })
}

/** Versions for the instance (`all`: every version), with the recommended one marked. */
export function useVersions(provider: Provider, id: string, all: boolean) {
  return useQuery({
    queryKey: ['versions', provider, id, all],
    queryFn: () => call(api.projects.versions, { params: { provider, id }, query: { all } }),
    staleTime: 5 * 60_000,
  })
}
