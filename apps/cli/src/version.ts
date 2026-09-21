import { z } from 'zod'
import pkg from '../package.json' with { type: 'json' }

/** The CLI version from package.json (inlined into the bundle by `bun build`). */
export const VERSION = z.object({ version: z.string() }).parse(pkg).version
