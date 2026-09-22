import {
  api,
  type InstallBody,
  type JobEvent,
  type PlanBody,
  type UpdateJobItem,
  type UpdateJobResponse,
} from '@mc-mod/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { call, stream } from '@/lib/api'

/** What installing a project means (dependencies, what's installed). Only fetched while `enabled`. */
export function useInstallPlan(body: PlanBody, enabled: boolean) {
  return useQuery({
    queryKey: ['install-plan', body],
    queryFn: () => call(api.install.plan, { body }),
    enabled,
    // Always fresh: it depends on what's installed right now.
    staleTime: 0,
    gcTime: 0,
    // A refetch mid-install would flip items to "installed" under the progress bars.
    refetchOnWindowFocus: false,
  })
}

export type ItemProgress =
  | { state: 'waiting' }
  | { state: 'downloading'; received: number; total: number }
  | { state: 'done'; fileName: string; skipped: boolean }
  | { state: 'failed'; message: string }

export type Run =
  | { state: 'idle' }
  | { state: 'running'; items: ItemProgress[] }
  | { state: 'finished'; items: ItemProgress[]; installed: number; failed: number }
  | { state: 'error'; error: unknown }

const running = (items: ItemProgress[]): Run => ({ state: 'running', items })

function applyEvent(items: ItemProgress[], e: JobEvent): ItemProgress[] {
  if (e.type === 'done') return items
  const next = [...items]
  if (e.type === 'progress') {
    next[e.index] = { state: 'downloading', received: e.received, total: e.total }
  } else if (e.type === 'item-done') {
    next[e.index] = { state: 'done', fileName: e.fileName, skipped: e.skipped }
  } else {
    next[e.index] = { state: 'failed', message: e.message }
  }
  return next
}

/**
 * Starts a background job (install or update) and follows its events. `begin` starts it and says how
 * many items it has. The mods list is refreshed before it resolves.
 */
export function useJob() {
  const client = useQueryClient()
  const [run, setRun] = useState<Run>({ state: 'idle' })

  /** Resolves with the final state: `finished`, or `error` if the job couldn't start or the stream broke. */
  const start = useCallback(
    async (begin: () => Promise<{ jobId: string; count: number }>): Promise<Run> => {
      let items: ItemProgress[] = []
      // Typed as the whole union: TS can't see the reassignments inside the stream callback.
      let last = running(items)
      setRun(last)
      try {
        const { jobId, count } = await begin()
        items = Array.from({ length: count }, () => ({ state: 'waiting' }))
        setRun(running(items))
        await stream(api.jobs.events, { params: { id: jobId } }, (e) => {
          items = applyEvent(items, e)
          last =
            e.type === 'done'
              ? { state: 'finished', items, installed: e.installed, failed: e.failed }
              : running(items)
          setRun(last)
        })
        if (last.state !== 'finished') throw new Error('The progress stream ended early')
      } catch (error) {
        last = { state: 'error', error }
        setRun(last)
      }
      // Waited for, so a dialog that closes on success closes onto the new list.
      await client.invalidateQueries({ queryKey: ['mods'] })
      return last
    },
    [client],
  )

  const reset = useCallback(() => setRun({ state: 'idle' }), [])
  return { run, start, reset }
}

/** An install job; `item-*` events index into `body.items`. */
export function useInstallJob() {
  const { run, start, reset } = useJob()
  const install = useCallback(
    (body: InstallBody) =>
      start(async () => ({
        ...(await call(api.install.install, { body })),
        count: body.items.length,
      })),
    [start],
  )
  return { run, start: install, reset }
}

/**
 * An update job: `updateAll` for jars with an update from the last check, `changeVersion` for any version
 * of one jar's project. `items` are the jars the job replaces, in event index order.
 */
export function useUpdateJob() {
  const { run, start, reset } = useJob()
  const [items, setItems] = useState<UpdateJobItem[]>([])

  const begin = useCallback(
    (request: () => Promise<UpdateJobResponse>) =>
      start(async () => {
        const res = await request()
        setItems(res.items)
        return { jobId: res.jobId, count: res.items.length }
      }),
    [start],
  )
  const updateAll = useCallback(
    (fileNames: string[]) => begin(() => call(api.mods.updateAll, { body: { fileNames } })),
    [begin],
  )
  const changeVersion = useCallback(
    (fileName: string, versionId: string) =>
      begin(() => call(api.mods.updateOne, { params: { fileName }, body: { versionId } })),
    [begin],
  )
  const resetAll = useCallback(() => {
    reset()
    setItems([])
  }, [reset])
  return { run, items, updateAll, changeVersion, reset: resetAll }
}
