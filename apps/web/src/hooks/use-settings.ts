import { api, type Settings, type SettingsBody } from '@mc-mod/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call } from '@/lib/api'

const key = ['settings'] as const

export function useSettings() {
  return useQuery({ queryKey: key, queryFn: () => call(api.settings.get) })
}

/** Saves settings. The key, provider and pre-release choice change search, versions and the mods list. */
export function useUpdateSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: SettingsBody) => call(api.settings.update, { body }),
    onSuccess: (data: Settings) => {
      client.setQueryData(key, data)
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== key[0] && q.queryKey[0] !== 'instance',
      })
    },
  })
}

/** Checks a CurseForge key: the given one, or the one in use. */
export function useTestCurseforgeKey() {
  return useMutation({
    mutationFn: (apiKey: string | undefined) =>
      call(api.settings.testCurseforge, { body: { apiKey } }),
  })
}
