import { z } from 'zod'
import { ContentKind, Loader } from './loader'

export const InstanceKind = z.enum(['client', 'server'])
export type InstanceKind = z.infer<typeof InstanceKind>

export const Confidence = z.enum(['high', 'medium', 'low'])
export type Confidence = z.infer<typeof Confidence>

/** Game version as the launchers write it: `1.21.1`, `26.2`, `24w14a`, `1.21-pre1`. */
export const GameVersion = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w.+-]+$/, 'Use letters, digits, dots, dashes or pluses')

export const LoaderVersion = GameVersion

/** Instance fields a detector can report. */
export const InstanceField = z.enum([
  'kind',
  'gameVersion',
  'loader',
  'loaderVersion',
  'contentDir',
])
export type InstanceField = z.infer<typeof InstanceField>

/** One piece of evidence, shown in the Instance dialog so the user can see why we think so. */
export const Detection = z.strictObject({
  /** Detector, e.g. `Prism launcher (mmc-pack.json)`. */
  source: z.string(),
  confidence: Confidence,
  /** The file or folder it came from, relative to the instance root when inside it. */
  detail: z.string(),
  /** The fields this detection provided in the merged result. */
  fields: z.array(InstanceField),
})
export type Detection = z.infer<typeof Detection>

/** A version/loader pair found but not chosen, e.g. one of several versions in `.minecraft/versions`. */
export const Suggestion = z.strictObject({
  label: z.string(),
  gameVersion: GameVersion,
  loader: Loader.nullable(),
  loaderVersion: LoaderVersion.nullable(),
})
export type Suggestion = z.infer<typeof Suggestion>

export const Instance = z.strictObject({
  /** Absolute path of the instance; `.mc-mod/` lives here. */
  root: z.string(),
  /** Absolute path of the game dir (differs from root for Prism/MultiMC: `<root>/.minecraft`). */
  gameDir: z.string(),
  kind: InstanceKind,
  /** null → the user has to choose (setup dialog). */
  gameVersion: GameVersion.nullable(),
  loader: Loader.nullable(),
  loaderVersion: LoaderVersion.nullable(),
  contentKind: ContentKind,
  /** Absolute path of `mods/` or `plugins/`. */
  contentDir: z.string(),
  detection: z.array(Detection),
  warnings: z.array(z.string()),
  suggestions: z.array(Suggestion),
})
export type Instance = z.infer<typeof Instance>

/** User choices that beat detection. Saved in `.mc-mod/state.json`. */
export const InstanceOverrides = z.strictObject({
  gameVersion: GameVersion.optional(),
  loader: Loader.optional(),
  loaderVersion: LoaderVersion.optional(),
  /** Relative to the instance root (or absolute inside it). */
  contentDir: z.string().trim().min(1).optional(),
})
export type InstanceOverrides = z.infer<typeof InstanceOverrides>
