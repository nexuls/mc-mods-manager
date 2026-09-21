# Progress

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped.
Update this file at the end of every working session (see AGENTS.md).

**Current phase:** 3 — Instance detection (Phase 2 CLI skeleton & serving done).

## Phase 0 — Planning
- [x] Architecture, API spec, UI spec, detection notes, external API notes
- [x] AGENTS.md
- [x] User review of [open-questions.md](open-questions.md)

## Phase 1 — Scaffolding
- [x] `git init`, root `bun init` with workspaces + catalog, `.gitignore`, `packageManager: bun@1.3.14`
- [x] `apps/web` via `bun create vite` (react-ts), scripts use `bunx --bun vite`; removed oxlint
- [x] Tailwind v4 + `@tailwindcss/vite`
- [x] shadcn init (radix, nova) + base components + field/label
- [x] Biome at root; `bun run check` passes
- [x] `packages/shared` workspace with zod (catalog)
- [x] `packages/shared` contents: `contract/define.ts`, `contract/errors.ts` (done in Phase 2; `domain/` starts with the first domain schema in Phase 3)
- [x] `apps/cli` Express + TS on Bun, `bun --watch` dev, `bun build` bundle (placeholder `bin.ts`)
- [x] Root `dev`, `build` (with `scripts/copy-web.ts`), `check`, `typecheck`, `test` scripts
- [x] Vite dev proxy `/api` → `127.0.0.1:4719`
- [x] `bun test` wired up; smoke tests for shared + cli (web tests need happy-dom, later)

## Phase 2 — CLI skeleton & serving
- [x] `bin.ts` with commander (`--dir`, `--port`, `--no-open`, `--browser`, `--exit-on-close`, `--version`); styled output with `@clack/prompts` + `picocolors` (D15)
- [x] `route()` adapter + zod error middleware; `call()` client in web; contract coverage test
- [x] `env.ts` zod schema for env vars (`MC_MOD_DEV`, `MC_MOD_DIR`); dev instance via `apps/cli/.env.local`
- [x] CLI options (`--dir` overrides `MC_MOD_DIR`) validated with zod
- [x] Stop the published CLI from auto-loading `.env` files from the user's cwd: shebang `bun --no-env-file`; dev mode is compiled out of the bundle (D15)
- [x] Express app factory, `/api/health` (first contract endpoint), static serving of `dist/web`, SPA fallback
- [x] Session token + Host check middleware; web API client sends token
- [x] Free port selection, open browser (Chromium `--app` mode if available, `--browser auto|app|tab`), graceful shutdown
- [x] Heartbeat + optional `--exit-on-close` idle shutdown
- [x] `bun link` works; `mc-mod` opens the UI from any dir (browser opening checked by hand only: tests use `--no-open`)

## Phase 3 — Instance detection
- [ ] Detectors: state override, Prism/MultiMC, CurseForge app, ATLauncher, Modrinth App, version json, server files, mods heuristic
- [ ] `GET/PUT /api/instance`, setup dialog in UI
- [ ] Fixture directories for each layout + tests
- [ ] Resolve a `mods/`/`plugins/` target dir to its parent instance root
- [ ] Manual test instance (dev): vanilla-launcher profile dir `NeoForge 1.21.1` (options.txt, 38 NeoForge 1.21.1 jars, no version json → mods heuristic)

## Phase 4 — Installed mods
- [ ] Jar metadata parsers (fabric, quilt, forge, neoforge, mcmod.info, plugin.yml, paper-plugin.yml, bungee.yml, velocity-plugin.json)
- [ ] sha1/sha512 + CurseForge murmur2 fingerprint (tested)
- [ ] Hash cache in state.json
- [ ] Identification pipeline (architecture §7.2): install record, Modrinth `/version_files`, launcher metadata (packwiz `.pw.toml`, CF `minecraftinstance.json`, ATLauncher), dual-source merge, compatibility check
- [ ] "Possible match" suggestions + manual link/unlink
- [ ] Installed view: table, enable/disable, remove, side badge

## Phase 5 — Search & install (Modrinth)
- [ ] Modrinth provider: search, project, versions, tags
- [ ] Best-version selection algorithm (+ tests)
- [ ] Dependency resolution + install plan endpoint
- [ ] Download, hash verify, atomic write; SSE job progress
- [ ] Browse view, project detail, install dialog

## Phase 6 — CurseForge
- [ ] Settings view + global config + key test
- [ ] CF provider: search, mod, files, fingerprints (plug into identification pipeline)
- [ ] Manual-download-required handling

## Phase 7 — Updates
- [ ] Check updates (Modrinth bulk + CF)
- [ ] Update one / update all

## Phase 8 — Server export
- [ ] Side resolution (override > platform > jar)
- [ ] Export preview + copy/zip modes
- [ ] Export view

## Phase 9 — Polish & release
- [ ] Error states, empty states, loading skeletons, dark mode
- [ ] README with usage + CurseForge key instructions
- [ ] Windows/macOS path testing
- [ ] `bun publish --dry-run`
- [ ] Optional: `bun build --compile` standalone binaries (linux/macos/windows)

## Session log
| Date | Summary |
|---|---|
| 2026-09-22 | Planning docs and AGENTS.md written. No code yet. |
| 2026-09-22 | Switched toolchain to Bun only (D11). |
| 2026-09-22 | Browser UI decision (D12); zod everywhere + shared API contract (D13, zod-contract.md). |
| 2026-09-22 | Phase 1 scaffolding done: bun workspaces, web (Vite 8/React 19/Tailwind 4/shadcn radix-nova), shared, cli (Express 5), Biome, bun test, build pipeline. check/typecheck/test/build all pass. |
| 2026-09-22 | Phase 2 done: shared contract (`defineEndpoint`, errors, `api.health`), `route()` adapter + error middleware, token/Host security, web `call()` client, `mc-mod` command with clack/picocolors terminal UI, port fallback, Chromium app mode, `--exit-on-close`, `.env` isolation. `bun link` verified. |
