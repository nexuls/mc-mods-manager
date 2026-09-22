import path from 'node:path'
import {
  type Confidence,
  type ContentKind,
  contentDirName,
  type Detection,
  type Instance,
  type InstanceField,
  type InstanceOverrides,
  loaderInfo,
  type Suggestion,
} from '@mc-mod/shared'
import { exists } from './detectors/fs'
import {
  detectAtLauncher,
  detectCurseForgeApp,
  detectModrinthApp,
  detectPrism,
} from './detectors/launchers'
import { detectFromJars } from './detectors/mods-heuristic'
import { detectServer } from './detectors/server'
import type { Finding, Layout } from './detectors/types'
import { detectVersionJson } from './detectors/version-json'
import { resolveLayout } from './layout'
import { isInside, resolveInside } from './paths'

/** Detectors in priority order: on equal confidence, the earlier one wins. */
const DETECTORS = [
  detectPrism,
  detectCurseForgeApp,
  detectAtLauncher,
  detectModrinthApp,
  detectVersionJson,
  detectServer,
]

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }
const OVERRIDE_SOURCE = 'Your settings (.mc-mod/state.json)'

export interface DetectOptions {
  overrides?: InstanceOverrides
  /** Extra warnings to surface (e.g. an ignored state.json). */
  warnings?: string[]
}

/** Detects the instance at `start` (see artifacts/instance-detection.md). Never writes anything. */
export async function detectInstance(
  start: string,
  options: DetectOptions = {},
): Promise<Instance> {
  const layout = await resolveLayout(start)
  const findings = (await Promise.all(DETECTORS.map((d) => d(layout)))).flat()

  const known = merge(findings)
  if (!known.gameVersion || !known.loader) {
    const kind: ContentKind = known.loader ? loaderInfo[known.loader.value].contentKind : 'mod'
    const dir = layout.contentDirHint ?? (await defaultContentDir(layout, kind))
    findings.push(...(await detectFromJars(dir, layoutKind(dir, kind))))
  }

  const overrides = options.overrides ?? {}
  const overrideFinding: Finding = {
    source: OVERRIDE_SOURCE,
    confidence: 'high',
    detail: path.join(layout.root, '.mc-mod', 'state.json'),
    gameVersion: overrides.gameVersion,
    loader: overrides.loader,
    loaderVersion: overrides.loaderVersion,
    contentDir: overrides.contentDir ? resolveInside(layout.root, overrides.contentDir) : undefined,
  }
  // Overrides go first so they beat everything at the same (high) confidence.
  const all = [overrideFinding, ...findings]
  const won = merge(all)

  const loader = won.loader?.value ?? null
  const contentKind: ContentKind = loader ? loaderInfo[loader].contentKind : 'mod'
  const contentDir =
    won.contentDir?.value ??
    layout.contentDirHint ??
    (await defaultContentDir(layout, contentKind, !loader))

  const winners = new Map<Finding, InstanceField[]>()
  for (const [field, w] of Object.entries(won) as [InstanceField, Won<unknown> | undefined][]) {
    if (w) winners.set(w.finding, [...(winners.get(w.finding) ?? []), field])
  }

  return {
    root: layout.root,
    gameDir: layout.gameDir,
    kind: won.kind?.value ?? 'client',
    gameVersion: won.gameVersion?.value ?? null,
    loader,
    loaderVersion: won.loaderVersion?.value ?? null,
    contentKind,
    contentDir,
    detection: all
      .filter((f) => f !== overrideFinding || winners.has(f))
      .map(
        (f): Detection => ({
          source: f.source,
          confidence: f.confidence,
          detail: isInside(layout.root, f.detail)
            ? path.relative(layout.root, f.detail) || '.'
            : f.detail,
          fields: winners.get(f) ?? [],
        }),
      ),
    warnings: [
      ...layout.warnings,
      ...(options.warnings ?? []),
      ...findings.flatMap((f) => f.warnings ?? []),
    ],
    suggestions: dedupe(findings.flatMap((f) => f.suggestions ?? [])),
  }
}

interface Won<T> {
  value: T
  finding: Finding
}

function merge(findings: Finding[]) {
  const ranked = findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => RANK[b.f.confidence] - RANK[a.f.confidence] || a.i - b.i)
    .map(({ f }) => f)

  function pick<K extends 'kind' | 'gameVersion' | 'loader' | 'contentDir'>(key: K) {
    const finding = ranked.find((f) => f[key] !== undefined)
    const value = finding?.[key]
    return finding && value !== undefined ? { value, finding } : undefined
  }

  const loader = pick('loader')
  // The loader version must belong to the chosen loader.
  const versionFrom = ranked.find(
    (f) => f.loaderVersion !== undefined && f.loader === loader?.value,
  )
  return {
    kind: pick('kind'),
    gameVersion: pick('gameVersion'),
    loader,
    loaderVersion:
      versionFrom?.loaderVersion !== undefined
        ? { value: versionFrom.loaderVersion, finding: versionFrom }
        : undefined,
    contentDir: pick('contentDir'),
  }
}

/** `<gameDir>/mods` or `<gameDir>/plugins`; with an unknown loader, whichever exists (mods first). */
async function defaultContentDir(
  layout: Layout,
  kind: ContentKind,
  loaderUnknown = false,
): Promise<string> {
  const mods = path.join(layout.gameDir, contentDirName.mod)
  const plugins = path.join(layout.gameDir, contentDirName.plugin)
  if (loaderUnknown && !(await exists(mods)) && (await exists(plugins))) return plugins
  return kind === 'plugin' ? plugins : mods
}

function layoutKind(dir: string, fallback: ContentKind): ContentKind {
  return path.basename(dir) === contentDirName.plugin ? 'plugin' : fallback
}

function dedupe(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>()
  return list.filter((s) => {
    const key = `${s.label}|${s.gameVersion}|${s.loader}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
