import { api } from '@mc-mod/shared'
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call } from '@/lib/api'

export const trashKey = ['trash'] as const

export function useTrash() {
  return useQuery({ queryKey: trashKey, queryFn: () => call(api.trash.list) })
}

/** Restoring changes the installed list too. */
const settle = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: trashKey }),
    client.invalidateQueries({ queryKey: ['mods'] }),
  ])

export function useRestoreTrash() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => call(api.trash.restore, { params: { id } }),
    onSettled: () => settle(client),
  })
}

export function useDeleteTrash() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => call(api.trash.remove, { params: { id } }),
    onSettled: () => client.invalidateQueries({ queryKey: trashKey }),
  })
}

export function useEmptyTrash() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => call(api.trash.empty),
    onSettled: () => client.invalidateQueries({ queryKey: trashKey }),
  })
}
