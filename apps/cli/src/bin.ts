#!/usr/bin/env bun
// Entry point for the `mc-mod` CLI.
import { run } from './cli/run'

await run(process.argv)
