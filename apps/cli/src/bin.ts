#!/usr/bin/env -S bun --no-env-file
// Entry point for the `mc-mod` CLI. `--no-env-file` stops Bun from loading .env files from the
// user's current directory into our process (dev runs use `bun src/bin.ts`, which still loads them).
import { run } from './cli/run'

await run(process.argv)
