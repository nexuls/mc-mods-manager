import { api, type InstallBody, type JobEvent, type PlanBody } from '@mc-mod/shared'
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

/** Starts an install job and follows its events. The mods list is refreshed when it ends. */
export function useInstallJob() {
  const client = useQueryClient()
  const [run, setRun] = useState<Run>({ state: 'idle' })

  /** Resolves with the final state: `finished`, or `error` if the job couldn't start or the stream broke. */
  const start = useCallback(
    async (body: InstallBody): Promise<Run> => {
      let items: ItemProgress[] = body.items.map(() => ({ state: 'waiting' }))
      // Typed as the whole union: TS can't see the reassignments inside the stream callback.
      let last = running(items)
      setRun(last)
      try {
        const { jobId } = await call(api.install.install, { body })
        await stream(api.jobs.events, { params: { id: jobId } }, (e) => {
          items = applyEvent(items, e)
          last =
            e.type === 'done'
              ? { state: 'finished', items, installed: e.installed, failed: e.failed }
              : running(items)
          setRun(last)
        })
        if (last.state !== 'finished') throw new Error('The install stream ended early')
      } catch (error) {
        last = { state: 'error', error }
        setRun(last)
      } finally {
        void client.invalidateQueries({ queryKey: ['mods'] })
      }
      return last
    },
    [client],
  )

  const reset = useCallback(() => setRun({ state: 'idle' }), [])
  return { run, start, reset }
}
