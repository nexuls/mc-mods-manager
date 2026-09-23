import { api, type ModList, modListFileName } from '@mc-mod/shared'
import { useMutation } from '@tanstack/react-query'
import { call } from '@/lib/api'

/** Fetches the mod list and saves it as a JSON file through the browser's download. */
export function useShareList() {
  return useMutation({
    mutationFn: async (): Promise<{ list: ModList; fileName: string }> => {
      const list = await call(api.share.exportList)
      const fileName = modListFileName(list.instance, new Date())
      download(fileName, JSON.stringify(list, null, 2))
      return { list, fileName }
    },
  })
}

/** What a list would install here. Nothing is written until the user picks items and installs. */
export function useImportPlan() {
  return useMutation({
    mutationFn: (list: ModList) => call(api.share.importPlan, { body: { list } }),
  })
}

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  // Revoked on the next tick: Safari needs the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
