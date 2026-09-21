import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import open from 'open'
import type { BrowserMode } from './options'

export type Opened =
  | { kind: 'app'; browser: string }
  | { kind: 'tab' }
  | { kind: 'failed'; reason: string }

interface Chromium {
  name: string
  exe: string
}

/**
 * Opens the UI. `auto` prefers a Chromium-based browser in app mode (`--app=<url>`: a window with no
 * address bar) and falls back to a normal tab in the default browser.
 */
export async function openBrowser(url: string, mode: BrowserMode): Promise<Opened> {
  if (!hasDisplay()) return { kind: 'failed', reason: 'no graphical display found' }

  if (mode !== 'tab') {
    const chromium = findChromium()
    if (chromium) {
      try {
        Bun.spawn([chromium.exe, `--app=${url}`], { stdio: ['ignore', 'ignore', 'ignore'] }).unref()
        return { kind: 'app', browser: chromium.name }
      } catch {
        // Fall back to a tab below.
      }
    }
  }

  try {
    await open(url)
    return { kind: 'tab' }
  } catch (err) {
    return { kind: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/** On Linux, opening a browser over plain SSH can't work, so don't try. */
function hasDisplay(): boolean {
  if (process.platform !== 'linux') return true
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
}

export function findChromium(): Chromium | undefined {
  return candidates().find((c) => c.exe !== '' && existsSync(c.exe))
}

function candidates(): Chromium[] {
  switch (process.platform) {
    case 'darwin': {
      const apps = [
        ['Google Chrome', 'Google Chrome.app/Contents/MacOS/Google Chrome'],
        ['Chromium', 'Chromium.app/Contents/MacOS/Chromium'],
        ['Microsoft Edge', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
        ['Brave', 'Brave Browser.app/Contents/MacOS/Brave Browser'],
        ['Vivaldi', 'Vivaldi.app/Contents/MacOS/Vivaldi'],
      ] as const
      return ['/Applications', path.join(homedir(), 'Applications')].flatMap((dir) =>
        apps.map(([name, rel]) => ({ name, exe: path.join(dir, rel) })),
      )
    }
    case 'win32': {
      const roots = [
        process.env.LOCALAPPDATA,
        process.env.PROGRAMFILES,
        process.env['PROGRAMFILES(X86)'],
      ].filter((r) => r !== undefined)
      const apps = [
        ['Google Chrome', 'Google/Chrome/Application/chrome.exe'],
        ['Microsoft Edge', 'Microsoft/Edge/Application/msedge.exe'],
        ['Brave', 'BraveSoftware/Brave-Browser/Application/brave.exe'],
        ['Chromium', 'Chromium/Application/chrome.exe'],
      ] as const
      return roots.flatMap((root) =>
        apps.map(([name, rel]) => ({ name, exe: path.join(root, rel) })),
      )
    }
    default: {
      const bins = [
        ['Google Chrome', 'google-chrome-stable'],
        ['Google Chrome', 'google-chrome'],
        ['Chromium', 'chromium'],
        ['Chromium', 'chromium-browser'],
        ['Brave', 'brave-browser'],
        ['Brave', 'brave'],
        ['Microsoft Edge', 'microsoft-edge-stable'],
        ['Microsoft Edge', 'microsoft-edge'],
        ['Vivaldi', 'vivaldi-stable'],
        ['Vivaldi', 'vivaldi'],
      ] as const
      return bins.map(([name, bin]) => ({ name, exe: Bun.which(bin) ?? '' }))
    }
  }
}
