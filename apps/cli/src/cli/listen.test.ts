import { afterEach, expect, test } from 'bun:test'
import type { Server } from 'node:http'
import express from 'express'
import { listen, PortInUseError } from './listen'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

async function start(port: number, strict: boolean) {
  const r = await listen(express(), port, strict)
  servers.push(r.server)
  return r
}

test('falls back to a free port when the preferred one is taken', async () => {
  const first = await start(0, false)
  const second = await start(first.port, false)
  expect(second.port).not.toBe(first.port)
})

test('strict mode fails on a taken port', async () => {
  const first = await start(0, false)
  await expect(start(first.port, true)).rejects.toBeInstanceOf(PortInUseError)
})
