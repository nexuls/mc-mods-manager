import { api, type InstanceOverrides, type InstanceResponse } from '@mc-mod/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call } from '@/lib/api'

const key = ['instance'] as const

export function useInstance() {
  return useQuery({ queryKey: key, queryFn: () => call(api.instance.get) })
}

/** Replaces the saved overrides; `{}` goes back to pure detection. */
export function useUpdateInstance() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: InstanceOverrides) => call(api.instance.update, { body }),
    onSuccess: (data: InstanceResponse) => {
      client.setQueryData(key, data)
      // Everything else depends on the instance (mods list, search filters…).
      void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== key[0] })
    },
  })
}
