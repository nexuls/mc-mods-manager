import { expect, test } from 'bun:test'
import { nameFromFile } from './library'

test.each([
  ['sodium-fabric-0.6.0+mc1.21.4.jar', 'sodium fabric'],
  ['create-1.21.1-6.0.10.jar', 'create'],
  ['JustEnoughItems_v19.1.jar.disabled', 'JustEnoughItems'],
  ['mod.jar', 'mod'],
])('nameFromFile(%p) → %p', (file, name) => {
  expect(nameFromFile(file)).toBe(name)
})
