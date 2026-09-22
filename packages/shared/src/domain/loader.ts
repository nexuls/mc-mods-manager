import { z } from 'zod'

export const Loader = z.enum([
  // mod loaders
  'fabric',
  'quilt',
  'forge',
  'neoforge',
  // plugin servers
  'paper',
  'spigot',
  'bukkit',
  'purpur',
  'folia',
  // proxies
  'velocity',
  'bungeecord',
  'waterfall',
  'vanilla',
])
export type Loader = z.infer<typeof Loader>

/** What goes in the content dir: mods (`mods/`) or plugins (`plugins/`). */
export const ContentKind = z.enum(['mod', 'plugin'])
export type ContentKind = z.infer<typeof ContentKind>

export const loaderInfo: Record<Loader, { label: string; contentKind: ContentKind }> = {
  fabric: { label: 'Fabric', contentKind: 'mod' },
  quilt: { label: 'Quilt', contentKind: 'mod' },
  forge: { label: 'Forge', contentKind: 'mod' },
  neoforge: { label: 'NeoForge', contentKind: 'mod' },
  paper: { label: 'Paper', contentKind: 'plugin' },
  spigot: { label: 'Spigot', contentKind: 'plugin' },
  bukkit: { label: 'Bukkit', contentKind: 'plugin' },
  purpur: { label: 'Purpur', contentKind: 'plugin' },
  folia: { label: 'Folia', contentKind: 'plugin' },
  velocity: { label: 'Velocity', contentKind: 'plugin' },
  bungeecord: { label: 'BungeeCord', contentKind: 'plugin' },
  waterfall: { label: 'Waterfall', contentKind: 'plugin' },
  vanilla: { label: 'Vanilla', contentKind: 'mod' },
}

/** Default content dir name for a content kind. */
export const contentDirName: Record<ContentKind, string> = { mod: 'mods', plugin: 'plugins' }
