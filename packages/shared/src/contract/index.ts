import * as health from './health'

export * from './define'
export * from './errors'
export * from './session'

/** The whole `/api` contract. Backend routes and frontend calls both go through it. */
export const api = { health }
