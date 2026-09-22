const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

const compact2 = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 })

/** `1234567` → `1.2M` (`1.23M` with `precise`). */
export function compactNumber(n: number, precise = false): string {
  return (precise ? compact2 : compact).format(n)
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** An ISO date as `3 days ago` (`Yesterday` with `capitalize`). */
export function timeAgo(iso: string, now = Date.now(), capitalize = false): string {
  const text = relativeText(iso, now)
  return capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function relativeText(iso: string, now: number): string {
  const seconds = (Date.parse(iso) - now) / 1000
  if (Number.isNaN(seconds)) return ''
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return relative.format(0, 'minute')
}

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function shortDate(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : date.format(t)
}

/** `2452735` → `2.3 MB`. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let n = bytes / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`
}

/** `plural(2, 'mod')` → `2 mods`. */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
