import { type Instance, type Loader, loaderInfo } from '@mc-mod/shared'

/** `NeoForge 21.1.250 · 1.21.1 · client`, or null parts when unknown. */
export function describeInstance(i: Instance): string {
  const loader = i.loader
    ? `${loaderInfo[i.loader].label}${i.loaderVersion ? ` ${i.loaderVersion}` : ''}`
    : 'Unknown loader'
  return [loader, i.gameVersion ?? 'unknown version', i.kind].join(' · ')
}

/** Loaders the user can pick, grouped for the select. Vanilla has nothing to manage. */
export const loaderGroups: { label: string; loaders: Loader[] }[] = [
  { label: 'Mod loaders', loaders: ['fabric', 'quilt', 'forge', 'neoforge'] },
  { label: 'Plugin servers', loaders: ['paper', 'purpur', 'folia', 'spigot', 'bukkit'] },
  { label: 'Proxies', loaders: ['velocity', 'bungeecord', 'waterfall'] },
]

export const loaderLabel = (l: Loader) => loaderInfo[l].label
