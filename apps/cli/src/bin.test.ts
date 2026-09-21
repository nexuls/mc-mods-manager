import { expect, test } from 'bun:test'

test('bin entry runs', async () => {
  const proc = Bun.spawn(['bun', `${import.meta.dir}/bin.ts`], { stdout: 'pipe' })
  expect(await proc.exited).toBe(0)
  expect(await new Response(proc.stdout).text()).toContain('mc-mod')
})
