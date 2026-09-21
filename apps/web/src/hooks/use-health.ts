import { api } from '@mc-mod/shared'
import { useQuery } from '@tanstack/react-query'
import { call } from '@/lib/api'

/** Polls `/api/health` every 10s. Also the CLI's heartbeat for `--exit-on-close`. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => call(api.health.get),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: false,
  })
}
