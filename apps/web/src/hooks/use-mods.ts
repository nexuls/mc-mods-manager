import { api, type InstalledMod, type Provider, type UpdateModBody } from '@mc-mod/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { call } from '@/lib/api'

const key = ['mods'] as const

export function useMods() {
  return useQuery({ queryKey: key, queryFn: () => call(api.mods.list) })
}

/** Re-scans and looks every jar up again. */
export function useRefreshMods() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => call(api.mods.refresh),
    onSuccess: (data) => client.setQueryData(key, data),
  })
}

/** Looks for updates; the list comes back with `update` set where there is one. */
export function useCheckUpdates() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => call(api.mods.checkUpdates),
    onSuccess: (data) => client.setQueryData(key, data),
  })
}

export function useUpdateMod() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ fileName, body }: { fileName: string; body: UpdateModBody }) =>
      call(api.mods.update, { params: { fileName }, body }),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
}

export function useRemoveMod() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (fileName: string) => call(api.mods.remove, { params: { fileName } }),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: ['trash'] }),
      ]),
  })
}

/** Possible matches for an unidentified jar; only fetched while `enabled` (the link dialog is open). */
export function useModSuggestions(fileName: string, enabled: boolean) {
  return useQuery({
    queryKey: [...key, fileName, 'suggestions'],
    queryFn: () => call(api.mods.suggestions, { params: { fileName } }),
    enabled,
    staleTime: 5 * 60_000,
  })
}

/** Installed jars by `provider:projectId`, so Browse and project pages can show "Installed". */
export function useInstalledProjects(): ReadonlyMap<string, InstalledMod> {
  const { data } = useMods()
  return useMemo(() => {
    const out = new Map<string, InstalledMod>()
    for (const m of data?.mods ?? []) {
      for (const s of m.sources) out.set(projectKey(s.provider, s.projectId), m)
    }
    return out
  }, [data])
}

export const projectKey = (provider: Provider, projectId: string) => `${provider}:${projectId}`
