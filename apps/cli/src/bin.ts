#!/usr/bin/env bun
// Entry point for the `mc-mod` CLI. The server and CLI options come in Phase 2 (artifacts/progress.md).
import { parseEnv, resolveTargetDir } from './env'

const env = parseEnv()
const dir = resolveTargetDir(env)

console.log(`mc-mod${env.MC_MOD_DEV ? ' (dev)' : ''}`)
console.log(`Instance directory: ${dir}`)
