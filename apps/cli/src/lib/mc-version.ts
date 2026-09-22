// Minecraft version comparison and the two range syntaxes found in jar metadata:
// Maven ranges (Forge/NeoForge `mods.toml`) and Fabric/Quilt version predicates.

interface Parsed {
  nums: number[]
  /** A pre-release/snapshot suffix (`1.21-pre1`, `1.21-alpha.24.10.a`) sorts before the release. */
  pre: string | null
}

function parse(v: string): Parsed | null {
  const m = /^(\d+(?:\.\d+)*)(?:[-+](.*))?$/.exec(v.trim())
  if (!m?.[1]) return null
  return { nums: m[1].split('.').map(Number), pre: m[2] && v.includes('-') ? m[2] : null }
}

/** Compares dotted versions (`1.21` equals `1.21.0`). Unparseable versions compare as strings. */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return a.localeCompare(b)
  const len = Math.max(pa.nums.length, pb.nums.length)
  for (let i = 0; i < len; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  if (pa.pre === pb.pre) return 0
  if (pa.pre === null) return 1
  if (pb.pre === null) return -1
  return pa.pre.localeCompare(pb.pre)
}

/** A release like `1.21.1` or `26.2` (no snapshot/pre-release suffix). */
export function isReleaseVersion(v: string): boolean {
  return /^\d+(\.\d+)+$/.test(v)
}

type Bound = { v: string; inclusive: boolean }
/** One interval; a range is a union (OR) of intervals. */
interface Interval {
  min?: Bound
  max?: Bound
}

export interface VersionRange {
  intervals: Interval[]
  /** Versions named in the range that could be "the" game version (inclusive bounds, exact pins). */
  candidates: string[]
}

function contains(i: Interval, v: string): boolean {
  if (i.min) {
    const c = compareVersions(v, i.min.v)
    if (c < 0 || (c === 0 && !i.min.inclusive)) return false
  }
  if (i.max) {
    const c = compareVersions(v, i.max.v)
    if (c > 0 || (c === 0 && !i.max.inclusive)) return false
  }
  return true
}

export function rangeContains(range: VersionRange, v: string): boolean {
  return range.intervals.some((i) => contains(i, v))
}

function candidatesOf(intervals: Interval[]): string[] {
  return intervals.flatMap((i) => [i.min, i.max].filter((b) => b?.inclusive).map((b) => b?.v ?? ''))
}

/**
 * Maven version range: `[1.21.1]`, `[1.21,1.22)`, `(,1.21]`, `[1.0,2.0),[3.0,)`.
 * A bare version (`1.21.1`) is a "soft requirement" in Maven; Forge treats it as that exact version.
 */
export function parseMavenRange(input: string): VersionRange | null {
  const s = input.replace(/\s+/g, '')
  if (!s) return null
  if (!/[[(]/.test(s)) {
    const iv: Interval = { min: { v: s, inclusive: true }, max: { v: s, inclusive: true } }
    return { intervals: [iv], candidates: [s] }
  }
  const intervals: Interval[] = []
  for (const m of s.matchAll(/([[(])([^\])]*)([\])])/g)) {
    const [, open, body = '', close] = m
    const parts = body.split(',')
    if (parts.length === 1) {
      const v = parts[0] ?? ''
      if (!v) return null
      intervals.push({ min: { v, inclusive: true }, max: { v, inclusive: true } })
      continue
    }
    const [lo, hi] = parts
    intervals.push({
      min: lo ? { v: lo, inclusive: open === '[' } : undefined,
      max: hi ? { v: hi, inclusive: close === ']' } : undefined,
    })
  }
  return intervals.length ? { intervals, candidates: candidatesOf(intervals) } : null
}

/**
 * Fabric/Quilt predicates: a string of space-separated AND terms, or an array (OR).
 * Terms: `*`, `1.21.1`, `1.21.x`, `>=1.21`, `>1.20`, `<=1.21.4`, `<1.22`, `=1.21`, `~1.21.1`, `^1.21`.
 */
export function parseFabricRange(input: string | readonly string[]): VersionRange | null {
  const alternatives = typeof input === 'string' ? [input] : input
  const intervals: Interval[] = []
  for (const alt of alternatives) {
    const iv = parseFabricAnd(alt)
    if (iv) intervals.push(iv)
  }
  return intervals.length ? { intervals, candidates: candidatesOf(intervals) } : null
}

function parseFabricAnd(expr: string): Interval | null {
  const terms = expr.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return null
  let iv: Interval = {}
  for (const term of terms) {
    const t = parseFabricTerm(term)
    if (!t) return null
    iv = intersect(iv, t)
  }
  return iv
}

function parseFabricTerm(term: string): Interval | null {
  if (term === '*') return {}
  const m = /^(>=|<=|>|<|=|~|\^)?(.+)$/.exec(term)
  if (!m?.[2]) return null
  const op = m[1] ?? ''
  const v = m[2]
  const wildcard = /^(\d+(?:\.\d+)*)\.[xX*]$/.exec(v)
  if (wildcard?.[1] && (op === '' || op === '=')) {
    return {
      min: { v: wildcard[1], inclusive: true },
      max: { v: bump(wildcard[1]), inclusive: false },
    }
  }
  switch (op) {
    case '>=':
      return { min: { v, inclusive: true } }
    case '>':
      return { min: { v, inclusive: false } }
    case '<=':
      return { max: { v, inclusive: true } }
    case '<':
      return { max: { v, inclusive: false } }
    case '~': {
      // ~1.21.1 → >=1.21.1 <1.22
      const nums = parse(v)?.nums
      if (!nums) return null
      const prefix = nums.slice(0, Math.min(2, nums.length)).join('.')
      return { min: { v, inclusive: true }, max: { v: bump(prefix), inclusive: false } }
    }
    case '^': {
      // ^1.21 → >=1.21 <2
      const major = parse(v)?.nums[0]
      if (major === undefined) return null
      return { min: { v, inclusive: true }, max: { v: String(major + 1), inclusive: false } }
    }
    default:
      return { min: { v, inclusive: true }, max: { v, inclusive: true } }
  }
}

/** `1.21` → `1.22`: increments the last component. */
function bump(v: string): string {
  const nums = v.split('.').map(Number)
  nums[nums.length - 1] = (nums.at(-1) ?? 0) + 1
  return nums.join('.')
}

function intersect(a: Interval, b: Interval): Interval {
  const tighterMin =
    !a.min || (b.min && compareVersions(b.min.v, a.min.v) > 0) ? (b.min ?? a.min) : a.min
  const tighterMax =
    !a.max || (b.max && compareVersions(b.max.v, a.max.v) < 0) ? (b.max ?? a.max) : a.max
  return { min: tighterMin, max: tighterMax }
}

/**
 * Picks the game version that satisfies the most ranges. Candidates are the release versions the ranges
 * name themselves. Ties go to the version more ranges pin exactly, then to the newest.
 */
export function bestCommonVersion(
  ranges: readonly VersionRange[],
): { version: string; matched: number; total: number } | null {
  const candidates = new Set(ranges.flatMap((r) => r.candidates).filter(isReleaseVersion))
  let best: { version: string; matched: number; pins: number } | null = null
  for (const c of candidates) {
    const matched = ranges.filter((r) => rangeContains(r, c)).length
    const pins = ranges.filter((r) => r.candidates.some((x) => compareVersions(x, c) === 0)).length
    if (
      !best ||
      matched > best.matched ||
      (matched === best.matched && pins > best.pins) ||
      (matched === best.matched && pins === best.pins && compareVersions(c, best.version) > 0)
    ) {
      best = { version: c, matched, pins }
    }
  }
  return best ? { version: best.version, matched: best.matched, total: ranges.length } : null
}
