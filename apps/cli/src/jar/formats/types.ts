import type { JarMeta } from '@mc-mod/shared'
import type { VersionRange } from '../../lib/mc-version'

/** What one metadata file in a jar yields. */
export interface FormatResult extends Omit<JarMeta, 'loaders'> {
  loaders: JarMeta['loaders']
  /** The game versions the jar declares support for, if it says. */
  minecraft: VersionRange | null
}

export interface FormatContext {
  /** META-INF/MANIFEST.MF main attributes, for `${file.jarVersion}` placeholders. */
  manifest: ReadonlyMap<string, string>
}

export type FormatParser = (text: string, ctx: FormatContext) => FormatResult | null
