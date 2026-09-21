# Progress

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped.
Update this file at the end of every working session (see AGENTS.md).

**Current phase:** 0 — Planning complete, nothing initialized.

## Phase 0 — Planning
- [x] Architecture, API spec, UI spec, detection notes, external API notes
- [x] AGENTS.md
- [ ] User review of [open-questions.md](open-questions.md)

## Phase 1 — Scaffolding
- [ ] `git init`, root `bun init` with workspaces, `.gitignore`, `packageManager: bun@1.3.x`
- [ ] `apps/web` via `bun create vite` (react-ts), scripts use `bunx --bun vite`; remove ESLint
- [ ] Tailwind v4 + `@tailwindcss/vite`
- [ ] shadcn init + base components
- [ ] Biome at root; `bun run check` passes
- [ ] `packages/shared` with zod: `domain/`, `contract/define.ts`, `contract/errors.ts`
- [ ] `apps/cli` Express + TS on Bun, `bun --watch` dev, `bun build` bundle
- [ ] Root `dev`, `build`, `check`, `typecheck`, `test` scripts
- [ ] `bun test` wired up; one passing test per package

## Phase 2 — CLI skeleton & serving
- [ ] `bin.ts` with commander (`--dir`, `--port`, `--no-open`, `--version`)
- [ ] `route()` adapter + zod error middleware; `call()` client in web; contract coverage test
- [ ] `env.ts` zod schema for env vars / CLI options
- [ ] Express app factory, `/api/health` (first contract endpoint), static serving of `dist/web`, SPA fallback
- [ ] Session token + Host check middleware; web API client sends token
- [ ] Free port selection, open browser (Chromium `--app` mode if available, `--browser tab|app`), graceful shutdown
- [ ] Heartbeat + optional `--exit-on-close` idle shutdown
- [ ] `bun link` works; `mc-mod` opens the UI from any dir

## Phase 3 — Instance detection
- [ ] Detectors: state override, Prism/MultiMC, CurseForge app, ATLauncher, Modrinth App, version json, server files, mods heuristic
- [ ] `GET/PUT /api/instance`, setup dialog in UI
- [ ] Fixture directories for each layout + tests

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
