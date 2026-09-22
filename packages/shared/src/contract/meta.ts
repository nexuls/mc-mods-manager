import { z } from 'zod'
import { ContentKind } from '../domain/loader'
import { Category } from '../domain/project'
import { defineEndpoint } from './define'
import { QueryBool } from './query'

/** Minecraft versions (from Modrinth's tags), newest first. */
export const gameVersions = defineEndpoint({
  method: 'GET',
  path: '/api/meta/game-versions',
  query: z.strictObject({ includeSnapshots: QueryBool.default(false) }),
  response: z.strictObject({ versions: z.array(z.string()) }),
})

/** Browse categories for mods or plugins. */
export const categories = defineEndpoint({
  method: 'GET',
  path: '/api/meta/categories',
  query: z.strictObject({ kind: ContentKind }),
  response: z.strictObject({ categories: z.array(Category) }),
})
