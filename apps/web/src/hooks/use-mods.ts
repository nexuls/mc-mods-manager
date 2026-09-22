import { api, type UpdateModBody } from '@mc-mod/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
    onSettled: () => client.invalidateQueries({ queryKey: key }),
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
