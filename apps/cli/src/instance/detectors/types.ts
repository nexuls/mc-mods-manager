import type { Confidence, InstanceKind, Loader, Suggestion } from '@mc-mod/shared'

/** What one detector found. Fields it doesn't know stay undefined. */
export interface Finding {
  source: string
  confidence: Confidence
  /** Absolute path of the file or folder the finding is based on. */
  detail: string
  kind?: InstanceKind
  gameVersion?: string
  loader?: Loader
  loaderVersion?: string
  /** Java major version, as the launcher or the version manifest records it. */
  javaVersion?: number
  /** Absolute path. */
  contentDir?: string
  warnings?: string[]
  suggestions?: Suggestion[]
}

export interface Layout {
  /** Instance root: `.mc-mod/` lives here. */
  root: string
  /** Where the game runs (`<root>/.minecraft` for Prism). */
  gameDir: string
  /** Set when the user pointed at a `mods/` or `plugins/` folder directly. */
  contentDirHint?: string
  /** Set when run inside `.minecraft/versions/<id>`. */
  versionId?: string
  warnings: string[]
}
