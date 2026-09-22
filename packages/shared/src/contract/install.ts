import { z } from 'zod'
import { Provider } from '../domain/mod'
import { Side } from '../domain/side'
import { defineEndpoint } from './define'
import { JobId } from './jobs'
import { ProjectId } from './projects'

/** Why an item is in the plan: what the user asked for, or a dependency of it. */
export const PlanRole = z.enum(['main', 'required', 'optional'])
export type PlanRole = z.infer<typeof PlanRole>

/**
 * - `install`: will be downloaded (optional ones only when the user ticks them)
 * - `installed`: already in the content dir, skipped
 * - `unavailable`: no version fits the instance; see `reason`
 */
export const PlanStatus = z.enum(['install', 'installed', 'unavailable'])
export type PlanStatus = z.infer<typeof PlanStatus>

export const PlanItem = z.strictObject({
  provider: Provider,
  projectId: z.string(),
  slug: z.string().optional(),
  title: z.string(),
  iconUrl: z.string().optional(),
  role: PlanRole,
  status: PlanStatus,
  versionId: z.string().optional(),
  versionNumber: z.string().optional(),
  fileName: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  side: Side,
  /** Titles of the plan items that need this one. */
  requiredBy: z.array(z.string()),
  /** A less direct fit, e.g. `Fabric build` on Quilt. */
  note: z.string().optional(),
  /** Why it's unavailable, or the file it's installed as. */
  reason: z.string().optional(),
})
export type PlanItem = z.infer<typeof PlanItem>

export const PlanBody = z.strictObject({
  provider: Provider,
  projectId: ProjectId,
  /** A specific version; the best one for the instance when left out. */
  versionId: ProjectId.optional(),
})
export type PlanBody = z.infer<typeof PlanBody>

export const PlanResponse = z.strictObject({
  /** The main project first, then its dependencies in the order they were found. */
  items: z.array(PlanItem),
  /** Incompatible relations, a hand-picked version that doesn't fit, missing dependencies. */
  warnings: z.array(z.string()),
})
export type PlanResponse = z.infer<typeof PlanResponse>

/** Resolves what installing a project means (dependencies, what's installed) without touching disk. */
export const plan = defineEndpoint({
  method: 'POST',
  path: '/api/install/plan',
  body: PlanBody,
  response: PlanResponse,
})

export const InstallBody = z.strictObject({
  /** Usually the plan's `install` items (plus the optional ones the user ticked). */
  items: z
    .array(z.strictObject({ provider: Provider, projectId: ProjectId, versionId: ProjectId }))
    .min(1)
    .max(60),
})
export type InstallBody = z.infer<typeof InstallBody>

/**
 * Downloads, verifies and installs the given versions in the background. Follow the job with
 * `GET /api/jobs/:id/events`; `item-*` events use the index into `items`.
 */
export const install = defineEndpoint({
  method: 'POST',
  path: '/api/install',
  body: InstallBody,
  response: z.strictObject({ jobId: JobId }),
})
