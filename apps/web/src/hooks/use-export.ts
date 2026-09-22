import { api, type ExportBody, type RevealBody } from '@mc-mod/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call } from '@/lib/api'

// Under `mods`, so changing a mod (side, enabled…) refreshes the preview too.
const key = ['mods', 'export'] as const

/** What a server export into `dirName` (default: the setting) would contain. */
export function useExportPreview(dirName: string | undefined) {
  return useQuery({
    queryKey: [...key, dirName ?? null],
    queryFn: () => call(api.export.preview, { query: { dirName } }),
  })
}

export function useRunExport() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: ExportBody) => call(api.export.run, { body }),
    // The folder's jar count changed.
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
}

/** Opens the export folder (or the instance root, for zips) in the file manager. */
export function useRevealExport() {
  return useMutation({ mutationFn: (body: RevealBody) => call(api.export.reveal, { body }) })
}
