import { expect, test } from 'bun:test'
import { watchIdle } from './idle'

test('fires once after the timeout without heartbeats, not before', async () => {
  let t = 0
  let idle = 0
  const w = watchIdle({ timeoutMs: 100, checkEveryMs: 5, now: () => t, onIdle: () => idle++ })

  t = 90
  w.beat()
  t = 150
  await Bun.sleep(20)
  expect(idle).toBe(0)

  t = 200
  await Bun.sleep(20)
  expect(idle).toBe(1)
  await Bun.sleep(20)
  expect(idle).toBe(1)
  w.stop()
})
