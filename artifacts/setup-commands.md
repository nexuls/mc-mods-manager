# Setup commands (official scaffolding)

**Bun only.** Bun is the package manager, runtime, script runner, bundler and test runner.
Never use `npm`, `npx`, `pnpm`, `yarn`, `node`, `tsx`, `tsup`, `ts-node` or `vitest`.
Use `bun` / `bunx` instead. The only lockfile is `bun.lock` (text format).

Run from repo root. Dev machine has Bun 1.3.x. Re-check each tool's docs right before running —
flags change between majors.

## 0. Root

```sh
git init
bun init -y
# then edit package.json: "private": true, "type": "module",
#   "workspaces": ["apps/*", "packages/*"], "packageManager": "bun@1.3.14"
# delete the index.ts that bun init generates; keep tsconfig.json as the base config
```

Add a root `bunfig.toml` if needed (for example `[install] exact = true`).

## 1. Frontend — `apps/web`

```sh
# Vite (official, bun variant): https://vite.dev/guide/
bun create vite apps/web --template react-ts

cd apps/web

# Tailwind v4 with the Vite plugin (official): https://tailwindcss.com/docs/installation/using-vite
bun add tailwindcss @tailwindcss/vite
#   - add tailwindcss() to vite.config.ts plugins
#   - replace src/index.css with: @import "tailwindcss";

# shadcn (official): https://ui.shadcn.com/docs/installation/vite
#   prerequisites: "@/*" path alias in tsconfig.json + tsconfig.app.json, and resolve.alias in vite.config.ts
bun add -d @types/bun          # for path/__dirname types in vite.config.ts (instead of @types/node)
bunx --bun shadcn@latest init
bunx --bun shadcn@latest add button input badge table dialog dropdown-menu select switch tabs tooltip sonner skeleton scroll-area card separator alert progress

# Data fetching / routing
bun add @tanstack/react-query react-router

# Zod (same major as shared) + form integration used by shadcn Form
bun add zod react-hook-form @hookform/resolvers
bun add @mc-mod/shared@workspace:*
bunx --bun shadcn@latest add form

cd ../..
```

- The Vite template ships ESLint — **remove it** (eslint packages, `eslint.config.js`, `lint` script) since Biome replaces it.
- Run Vite on the Bun runtime: scripts use `bunx --bun vite` (`dev`, `build`, `preview`).

Vite dev proxy (in `vite.config.ts`):

```ts
server: { proxy: { '/api': 'http://127.0.0.1:4719' } }
```

In dev, the Express server runs with a fixed port and `MC_MOD_DEV=1`, which disables the token check for
requests coming through the Vite proxy (dev only, never in the built output).

## 2. Biome — repo root (covers web + cli + shared)

```sh
# official: https://biomejs.dev/guides/manual-installation/
bun add -d -E @biomejs/biome
bunx biome init
```

Then configure `biome.json`: formatter (2 spaces, single quotes, line width 100), linter recommended,
`vcs.useIgnoreFile: true`, ignore `**/dist`, and `apps/web/src/components/ui/**` excluded from lint
(shadcn-generated). Enable Tailwind directive parsing for CSS (`css.parser.tailwindDirectives: true`).

## 3. Backend/CLI — `apps/cli`

Express has no official TS scaffold (`express-generator` is JS/legacy), so start from `bun init`:

```sh
mkdir -p apps/cli && cd apps/cli
bun init -y                      # creates package.json, tsconfig.json, index.ts → move to src/bin.ts
bun add express commander open env-paths zod yauzl-promise yaml smol-toml
bun add @mc-mod/shared@workspace:*
bun add -d @types/express @types/bun typescript
cd ../..
```

- `package.json`: `"name": "mc-mod"`, `"type": "module"`, `"bin": { "mc-mod": "./dist/bin.js" }`, `"files": ["dist"]`.
- `src/bin.ts` starts with `#!/usr/bin/env bun`. The CLI requires Bun at runtime.
- Scripts:
  - `dev` = `MC_MOD_DEV=1 bun --watch src/bin.ts --no-open --port 4719`
  - `build` = `bun build src/bin.ts --target=bun --outdir=dist` (bundles `@mc-mod/shared`)
  - `compile` = `bun build src/bin.ts --compile --outfile=dist/mc-mod` (optional standalone binary, Phase 9)
  - `typecheck` = `tsc --noEmit` (runs through `bun run`; `typescript` is only used for type-checking)
- tsconfig: keep what `bun init` generates (`moduleResolution: bundler`, `types: ["bun"]`, `strict`,
  `verbatimModuleSyntax`, `noEmit`).
- Use Bun APIs where they simplify things: `Bun.file` / `Bun.write`, `Bun.CryptoHasher` (sha1/sha512),
  `Bun.hash.murmur32v2` if it matches CurseForge's variant (verify with test vectors, otherwise implement by hand).
  Express stays the HTTP framework (it runs on Bun's `node:http` compatibility).
- Port 0 on `listen()` gives a free port, so no `get-port` dependency is needed.

## 4. Shared — `packages/shared`

```sh
mkdir -p packages/shared && cd packages/shared
bun init -y                      # name: "@mc-mod/shared", "private": true
bun add zod
cd ../..
```

Export TS source directly (`"exports": { ".": "./src/index.ts" }`). Vite and `bun build` both compile it,
so shared has no build step. Depend on it from the apps with `"@mc-mod/shared": "workspace:*"`.

**One zod version everywhere:** pin it once with a Bun workspace catalog in the root `package.json`
(`"workspaces": { "packages": ["apps/*", "packages/*"], "catalog": { "zod": "^4.x" } }`). Each workspace then
declares `"zod": "catalog:"`, which gives shared, web and cli the same Zod v4 copy so schemas can be shared across packages.

## 5. Testing — `bun test`

- Backend and shared: `bun test` (Jest-compatible `bun:test` API). Files: `*.test.ts` next to the source,
  or under `test/`.
- HTTP tests: start the Express app on port 0 and call it with `fetch`, so no supertest is needed.
- Web (later): `bun add -d happy-dom @testing-library/react @testing-library/dom` plus a `bunfig.toml`
  `[test] preload` that registers happy-dom.

## 6. Root scripts (target)

```json
{
  "dev": "bun run --filter './apps/*' dev",
  "build": "bun run --filter @mc-mod/web build && bun run --filter mc-mod build && bun scripts/copy-web.ts",
  "check": "biome check .",
  "fix": "biome check --write .",
  "typecheck": "bun run --filter '*' typecheck",
  "test": "bun test"
}
```

`bun run --filter` runs the scripts in parallel and prefixes their output, so no `concurrently` is needed.
