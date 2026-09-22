import { afterAll, afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

/** The globals happy-dom changes, as happy-dom sets them and as Bun had them (undefined: absent). */
let swap: { dom: Map<string, PropertyDescriptor>; bun: Map<string, PropertyDescriptor | undefined> }

/**
 * Gives the calling test file a DOM (happy-dom) and takes it away after the file, so the CLI tests that
 * share the `bun test` process keep Bun's own `fetch`, `Response` and friends.
 *
 * Every file gets the same window: React DOM and Testing Library are imported once per run and keep
 * the first `document` they saw. Call this before anything that reads the DOM when it's imported
 * (React DOM, Testing Library, and so every component): import those with `await import()` after it.
 * Rendered trees are unmounted after each test.
 */
export function withDom(): void {
  if (!swap) {
    const before = Object.getOwnPropertyDescriptors(globalThis)
    GlobalRegistrator.register({ url: 'http://127.0.0.1:4719/' })
    const after = Object.getOwnPropertyDescriptors(globalThis)
    swap = { dom: new Map(), bun: new Map() }
    for (const [key, desc] of Object.entries(after)) {
      const old = before[key]
      if (old && old.value === desc.value && old.get === desc.get) continue
      swap.dom.set(key, desc)
      swap.bun.set(key, old)
    }
  } else {
    for (const [key, desc] of swap.dom) Object.defineProperty(globalThis, key, desc)
  }
  // Registered per file: a hook in a shared module would only run for the first file importing it.
  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  })
  afterAll(async () => {
    // Let React finish work it scheduled after the last test before `window` goes away.
    await new Promise((resolve) => setTimeout(resolve, 20))
    for (const [key, desc] of swap.bun) {
      if (desc) Object.defineProperty(globalThis, key, desc)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
}
