import { SessionToken, TOKEN_PARAM } from '@mc-mod/shared'

const TOKEN_KEY = 'mc-mod.token'

/**
 * Moves the session token from the `?t=` URL param (set by the CLI) into sessionStorage and removes it
 * from the address bar, so it doesn't end up in history or screenshots. Call once at startup.
 */
export function captureToken(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(TOKEN_PARAM)) return
  const fromUrl = SessionToken.safeParse(url.searchParams.get(TOKEN_PARAM))
  if (fromUrl.success) {
    try {
      sessionStorage.setItem(TOKEN_KEY, fromUrl.data)
    } catch {
      // Storage can be disabled; the token then lives only in memory for this page load.
      memoryToken = fromUrl.data
    }
  }
  url.searchParams.delete(TOKEN_PARAM)
  window.history.replaceState(window.history.state, '', url)
}

let memoryToken: SessionToken | undefined

/** The session token, if the page was opened from the CLI's link. Dev mode works without one. */
export function getToken(): SessionToken | undefined {
  try {
    const parsed = SessionToken.safeParse(sessionStorage.getItem(TOKEN_KEY))
    if (parsed.success) return parsed.data
  } catch {
    // Fall through to the in-memory copy.
  }
  return memoryToken
}
