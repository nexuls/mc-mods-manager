import * as health from './health'
import * as instance from './instance'

export * from './define'
export * from './errors'
export { InstanceResponse } from './instance'
export * from './session'

/** The whole `/api` contract. Backend routes and frontend calls both go through it. */
export const api = { health, instance }
