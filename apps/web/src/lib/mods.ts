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

export function filterMods(
  mods: readonly InstalledMod[],
  filter: ModFilter,
  text: string,
): InstalledMod[] {
  const q = text.trim().toLowerCase()
  return mods.filter(
    (m) =>
      matchesFilter[filter](m) &&
      (!q ||
        [displayName(m), m.fileName, m.meta?.id ?? '', ...m.sources.map((s) => s.slug ?? '')].some(
          (x) => x.toLowerCase().includes(q),
        )),
  )
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
