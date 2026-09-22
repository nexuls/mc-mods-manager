import type { InstalledMod, ModSource, Side, SourceMethod } from '@mc-mod/shared'

export const ModFilter = [
  'all',
  'disabled',
  'unidentified',
  'incompatible',
  'client',
  'server',
] as const
export type ModFilter = (typeof ModFilter)[number]

export const filterLabel: Record<ModFilter, string> = {
  all: 'All',
  disabled: 'Disabled',
  unidentified: 'Unidentified',
  incompatible: 'Incompatible',
  client: 'Client-only',
  server: 'Server-side',
}

const matchesFilter: Record<ModFilter, (m: InstalledMod) => boolean> = {
  all: () => true,
  disabled: (m) => !m.enabled,
  unidentified: (m) => m.sources.length === 0,
  incompatible: (m) =>
    m.compatibility === 'wrong-loader' || m.compatibility === 'wrong-game-version',
  client: (m) => m.side === 'client',
  // What a server export would include: server, both and unknown (unknown is reviewed, not dropped).
  server: (m) => m.side !== 'client',
}

export function primary(m: InstalledMod): ModSource | undefined {
  return m.sources.find((s) => s.provider === m.primarySource) ?? m.sources[0]
}

/** Platform title, then the jar's name, then the file name. */
export function displayName(m: InstalledMod): string {
  return primary(m)?.title ?? m.meta?.name ?? m.meta?.id ?? m.fileName
}

export function displayVersion(m: InstalledMod): string | undefined {
  return primary(m)?.versionNumber ?? m.meta?.version
}

export const SortKey = ['name', 'source', 'side', 'enabled'] as const
export type SortKey = (typeof SortKey)[number]
export type ModSort = { key: SortKey; desc: boolean }

export const defaultSort: ModSort = { key: 'name', desc: false }

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

// Ascending orders for the non-name columns. Local files sort after both providers.
const sourceRank = (m: InstalledMod) => {
  const p = primary(m)?.provider
  return p === 'modrinth' ? 0 : p === 'curseforge' ? 1 : 2
}
const sideRank: Record<Side, number> = { client: 0, server: 1, both: 2, unknown: 3 }

const compareBy: Record<SortKey, (a: InstalledMod, b: InstalledMod) => number> = {
  name: (a, b) => collator.compare(displayName(a), displayName(b)),
  source: (a, b) => sourceRank(a) - sourceRank(b),
  side: (a, b) => sideRank[a.side] - sideRank[b.side],
  // Enabled first.
  enabled: (a, b) => Number(b.enabled) - Number(a.enabled),
}

/** Sorts a copy by one column. Ties always fall back to name A→Z, whatever the direction. */
export function sortMods(mods: readonly InstalledMod[], sort: ModSort): InstalledMod[] {
  const dir = sort.desc ? -1 : 1
  return [...mods].sort((a, b) => dir * compareBy[sort.key](a, b) || compareBy.name(a, b))
}

/** The next sort after clicking a column header: flip the direction, or start ascending on a new column. */
export function toggleSort(current: ModSort, key: SortKey): ModSort {
  return current.key === key ? { key, desc: !current.desc } : { key, desc: false }
}

export function filterMods(
  mods: readonly InstalledMod[],
  filter: ModFilter,
  text: string,
  sort: ModSort = defaultSort,
): InstalledMod[] {
  const q = text.trim().toLowerCase()
  const shown = mods.filter(
    (m) =>
      matchesFilter[filter](m) &&
      (!q ||
        [displayName(m), m.fileName, m.meta?.id ?? '', ...m.sources.map((s) => s.slug ?? '')].some(
          (x) => x.toLowerCase().includes(q),
        )),
  )
  return sortMods(shown, sort)
}

export function countByFilter(mods: readonly InstalledMod[]): Record<ModFilter, number> {
  const out: Record<ModFilter, number> = {
    all: 0,
    disabled: 0,
    unidentified: 0,
    incompatible: 0,
    client: 0,
    server: 0,
  }
  for (const m of mods) for (const f of ModFilter) if (matchesFilter[f](m)) out[f]++
  return out
}

/**
 * The project page. Modrinth redirects `/project/<id|slug>` to the right page type. The CurseForge
 * `/projects/<id>` redirect is unverified (its bot protection blocks curl); Phase 6 has real slugs.
 */
export function projectUrl(s: Pick<ModSource, 'provider' | 'projectId' | 'slug'>): string {
  return s.provider === 'modrinth'
    ? `https://modrinth.com/project/${encodeURIComponent(s.slug ?? s.projectId)}`
    : `https://www.curseforge.com/projects/${encodeURIComponent(s.projectId)}`
}

export const methodLabel: Record<SourceMethod, string> = {
  'install-record': 'Installed by mc-mod',
  hash: 'Exact file match',
  manual: 'Linked by you',
  'launcher-metadata': 'Recorded by your launcher',
}

export const sideLabel: Record<Side, string> = {
  client: 'Client',
  server: 'Server',
  both: 'Both',
  unknown: 'Unknown',
}

/**
 * A Modrinth project id or slug from what the user typed: `sodium`, `AANobbMI`, or a page URL like
 * `https://modrinth.com/mod/sodium/versions`. Null when it doesn't look like either.
 */
export function parseModrinthRef(input: string): string | null {
  const s = input.trim()
  const url = /^(?:https?:\/\/)?(?:www\.)?modrinth\.com\/[a-z]+\/([\w.-]+)/i.exec(s)
  if (url?.[1]) return url[1]
  return /^[\w.-]{2,64}$/.test(s) ? s : null
}
