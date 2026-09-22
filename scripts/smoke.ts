// Starts a built mc-mod (a standalone binary, or the npm bundle through bun), loads the web UI and
// /api/health with the printed session link, and checks the version. Used by the Test and Release
// workflows on every OS.
//
//   bun scripts/smoke.ts dist/release/mc-mod-linux-x64
//   bun scripts/smoke.ts apps/cli/dist/bin.js
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'

const root = path.resolve(import.meta.dir, '..')
const { positionals } = parseArgs({ allowPositionals: true })
const [target] = z.tuple([z.string().min(1)]).parse(positionals)
const file = path.resolve(target)
const cmd = file.endsWith('.js') ? [process.execPath, file] : [file]
const { version } = z
  .object({ version: z.string() })
  .parse(await Bun.file(path.join(root, 'apps/cli/package.json')).json())

class SmokeFailure extends Error {}
const fail = (message: string): never => {
  throw new SmokeFailure(message)
}

const printed = Bun.spawnSync([...cmd, '--version'])
  .stdout.toString()
  .trim()
if (printed !== version) {
  console.error(`✗ --version printed "${printed}", expected "${version}"`)
  process.exit(1)
}

// An empty folder is enough: the server starts and asks for setup in the UI.
const dir = await mkdtemp(path.join(tmpdir(), 'mc-mod-smoke-'))
const port = 47_000 + Math.floor(Math.random() * 1000)
const proc = Bun.spawn([...cmd, '--dir', dir, '--no-open', '--port', String(port)], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: { ...process.env, NO_COLOR: '1' },
})
// Both pipes are read until the server exits. Stopping early closes the pipe, and the server's next
// write to it (SIGPIPE) kills it mid-request.
const output = { stdout: '', stderr: '' }
const drained = Promise.all([drain(proc.stdout, 'stdout'), drain(proc.stderr, 'stderr')])

try {
  const url = await waitForUrl(20_000)
  const token = url.searchParams.get('t') ?? fail('The printed URL has no token')

  const page = await fetch(url)
  const html = await page.text()
  if (!page.ok || !html.includes('<div id="root">')) fail(`GET / answered ${page.status}`)
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? fail('No script in index.html')
  const asset = await fetch(new URL(script, url))
  if (!asset.ok) fail(`GET ${script} answered ${asset.status}`)

  const health = await fetch(new URL('/api/health', url), { headers: { 'X-MC-Mod-Token': token } })
  const body = z.object({ ok: z.literal(true), version: z.string() }).parse(await health.json())
  if (body.version !== version) fail(`/api/health says ${body.version}, expected ${version}`)
  const denied = await fetch(new URL('/api/health', url))
  if (denied.status !== 401) fail(`/api/health without a token answered ${denied.status}`)

  console.log(`✓ ${path.relative(root, file)} ${version}: UI, assets and API answer on ${url.host}`)
} catch (err) {
  if (!(err instanceof SmokeFailure)) throw err
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
} finally {
  proc.kill()
  await proc.exited
  await drained
  if (process.exitCode === 1) {
    console.error(`--- stdout ---\n${output.stdout}\n--- stderr ---\n${output.stderr}`)
  }
  await rm(dir, { recursive: true, force: true })
}

/** Waits for the session link in the server's output. */
async function waitForUrl(ms: number): Promise<URL> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline && proc.exitCode === null) {
    const match = /http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]+/.exec(output.stdout)
    if (match) return new URL(match[0])
    await Bun.sleep(50)
  }
  return fail(proc.exitCode === null ? 'No session link printed' : `Exited with ${proc.exitCode}`)
}

async function drain(stream: ReadableStream<Uint8Array>, key: keyof typeof output): Promise<void> {
  const decoder = new TextDecoder()
  for await (const chunk of stream) output[key] += decoder.decode(chunk, { stream: true })
}
