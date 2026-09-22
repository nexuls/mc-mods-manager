import { api } from '@mc-mod/shared'
import { useQuery } from '@tanstack/react-query'
import { ApiClientError, call } from '@/lib/api'

/**
 * Polls `/api/health` every 10s. Also the CLI's heartbeat for `--exit-on-close`.
 * A poll retries twice before failing, so the query only errors after 3 failures in a row (ui-spec).
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => call(api.health.get),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: 2,
    retryDelay: 1_000,
  })
}

export type ServerStatus =
  | 'checking'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unauthorized'

type HealthState = Pick<
  ReturnType<typeof useHealth>,
  'isError' | 'isSuccess' | 'error' | 'failureCount' | 'failureReason'
>

export function serverStatus(health: HealthState): ServerStatus {
  // The server answered, it just doesn't know this page's token (a link from an earlier run).
  const reason = health.error ?? health.failureReason
  if (reason instanceof ApiClientError && reason.code === 'UNAUTHORIZED') return 'unauthorized'
  if (health.isError) return 'disconnected'
  if (health.failureCount > 0) return 'reconnecting'
  if (health.isSuccess) return 'connected'
  return 'checking'
}
