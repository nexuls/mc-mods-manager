/** How long the server waits for a heartbeat before `--exit-on-close` stops it. */
export const IDLE_TIMEOUT_MS = 60_000

/**
 * Calls `onIdle` once no heartbeat arrived for `timeoutMs`. The UI polls `/api/health` every 10s,
 * so a closed tab (or a browser that never opened) stops the server after about a minute.
 */
export function watchIdle(options: {
  timeoutMs?: number
  checkEveryMs?: number
  now?: () => number
  onIdle: () => void
}): { beat: () => void; stop: () => void } {
  const { timeoutMs = IDLE_TIMEOUT_MS, checkEveryMs = 5_000, now = Date.now } = options
  let last = now()
  const timer = setInterval(() => {
    if (now() - last < timeoutMs) return
    clearInterval(timer)
    options.onIdle()
  }, checkEveryMs)
  timer.unref()
  return {
    beat: () => {
      last = now()
    },
    stop: () => clearInterval(timer),
  }
}
