import { z } from 'zod'
import { ModFileName } from '../domain/mod'
import { defineEndpoint } from './define'

/** A trashed jar's file name in `.mc-mod/trash/`: `<epoch ms>-<original file name>`. */
export const TrashId = z
  .string()
  .max(300)
  .regex(/^\d{1,16}-[^/\\]+\.jar(\.disabled)?$/i, 'Must be a trashed jar name')
export type TrashId = z.infer<typeof TrashId>

export const TrashItem = z.strictObject({
  id: TrashId,
  /** The name it had in the content folder, and gets back on restore (`.jar.disabled` stays disabled). */
  fileName: ModFileName,
  trashedAt: z.iso.datetime(),
  size: z.number().int().nonnegative(),
})
export type TrashItem = z.infer<typeof TrashItem>

export const TrashResponse = z.strictObject({
  /** Newest first. */
  items: z.array(TrashItem),
  totalSize: z.number().int().nonnegative(),
})
export type TrashResponse = z.infer<typeof TrashResponse>

const IdParams = z.strictObject({ id: TrashId })

/** Jars removed or replaced by an update, kept in `.mc-mod/trash/`. */
export const list = defineEndpoint({
  method: 'GET',
  path: '/api/trash',
  response: TrashResponse,
})

/**
 * Moves a trashed jar back into the content folder under its old name. CONFLICT when a jar with that
 * name is there, enabled or disabled.
 */
export const restore = defineEndpoint({
  method: 'POST',
  path: '/api/trash/:id/restore',
  params: IdParams,
  response: z.strictObject({ fileName: ModFileName }),
})

/** Deletes one trashed jar for good. */
export const remove = defineEndpoint({
  method: 'DELETE',
  path: '/api/trash/:id',
  params: IdParams,
  response: z.strictObject({ id: TrashId }),
})

/** Deletes every trashed jar for good. */
export const empty = defineEndpoint({
  method: 'DELETE',
  path: '/api/trash',
  response: z.strictObject({
    removed: z.number().int().nonnegative(),
    freedBytes: z.number().int().nonnegative(),
  }),
})
