import * as health from './health'
import * as instance from './instance'
import * as mods from './mods'

export * from './define'
export * from './errors'
export { InstanceResponse } from './instance'
export { ModsResponse, UpdateModBody } from './mods'
export * from './session'

/** The whole `/api` contract. Backend routes and frontend calls both go through it. */
export const api = { health, instance, mods }
