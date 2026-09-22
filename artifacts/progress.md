# Progress

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped.
Update this file at the end of every working session (see AGENTS.md).

**Current phase:** 7 — Updates (Phase 6 CurseForge done).

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
- [x] Detectors: state override, Prism/MultiMC, CurseForge app, ATLauncher, Modrinth App, version json (+ TLauncher `home/<id>`, `launcher_profiles.json` game dirs), server files, mods heuristic
- [x] `GET/PUT /api/instance`, setup dialog in UI (+ header badge, startup summary in the terminal)
- [x] Fixture directories for each layout + tests (`apps/cli/test/fixtures`, copied to a temp dir per test)
- [x] Resolve a `mods/`/`plugins/` target dir to its parent instance root (also Prism game dirs and `versions/<id>`)
- [x] Manual test instance (dev): `NeoForge 1.21.1` is a TLauncher `home/<id>` dir, so it resolves with high confidence from `versions/NeoForge 1.21.1/*.json` (NeoForge 21.1.250). The jar heuristic on its 38 jars also gives NeoForge 1.21.1 (30 of 34 agree)

## Phase 4 — Installed mods
- [x] Jar metadata parsers (fabric, quilt, forge, neoforge, mcmod.info, plugin.yml, paper-plugin.yml, bungee.yml, velocity-plugin.json) — done in Phase 3 for the heuristic
- [x] sha1/sha512 + CurseForge murmur2 fingerprint (tested)
- [x] Hash cache in state.json (`jarCache`, keyed by file name without `.disabled`, invalidated by size/mtime or `JAR_CACHE_VERSION`)
- [x] Identification pipeline (architecture §7.2): install record (read; written by the installer in Phase 5), Modrinth `/version_files`, launcher metadata (packwiz `.pw.toml`, CF `minecraftinstance.json`, ATLauncher), dual-source merge, compatibility check. The CurseForge fingerprint lookup plugs in with Phase 6
- [x] "Possible match" suggestions + manual link/unlink (Modrinth; CurseForge links come with Phase 6)
- [x] Installed view: table, enable/disable, remove (to `.mc-mod/trash/`), side badge, filters, link dialog

## Phase 5 — Search & install (Modrinth)
- [x] Search, project, versions and meta endpoints (`services/catalog.ts`)
- [x] Modrinth provider: search, project, versions, tags (in-memory TTL cache, `lib/ttl-cache.ts`)
- [x] Best-version selection algorithm (+ tests): `services/versions.ts`
- [x] Dependency resolution + install plan endpoint (`services/installer.ts`)
- [x] Download, hash verify, atomic write; SSE job progress (`lib/download.ts`, `services/jobs.ts`, `streamRoute()`)
- [x] Browse view, project detail, install dialog (react-router: `/`, `/browse`, `/project/:provider/:id`)

## Phase 6 — CurseForge
- [x] Settings view + global config + key test (`config.ts`, `/api/settings`, `settings-view.tsx`)
- [x] CF provider: search, mod, files, fingerprints (plug into identification pipeline) (`providers/curseforge.ts`)
- [x] CurseForge in Browse, project pages and installs (catalog/installer pick the platform per request)
- [x] Manual-download-required handling (`manual` plan items with a Download link)
- [x] CurseForge manual links + suggestions
- [ ] Follow-up: `modLoaderTypes` (multi-loader search on Quilt / NeoForge 1.20.1) is sent as a JSON array; check it with a key that may search

## Phase 7 — Updates
- [ ] Check updates (Modrinth bulk + CF)
- [ ] Update one / update all

## Phase 8 — Server export
- [ ] Side resolution (override > platform > jar)
- [ ] Export preview + copy/zip modes
- [ ] Export view

## Phase 9 — Polish & release
- [ ] Error states, empty states, loading skeletons, dark mode
- [ ] Web component tests (happy-dom); trash restore/empty UI
- [x] README with usage + CurseForge key instructions (update it as Phases 7–8 land)
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
| 2026-09-22 | Phase 3 done: version ranges (`lib/mc-version.ts`), jar metadata parsers (fflate), safe paths + `state.json`, detectors with fixtures, `GET/PUT /api/instance`, CLI startup summary, web header + setup dialog (checked with headless Chrome screenshots). |
| 2026-09-22 | Phase 4 done: sha1/sha512 + CurseForge murmur2 (vectors from the C reference), jar scan with size+mtime cache, Modrinth provider (hash lookup, projects, search; live test behind `MC_MOD_LIVE=1`), launcher metadata, source merge + compatibility + side, `/api/mods` (list/refresh/PATCH/DELETE/suggestions), Installed view. On a copy of the dev instance: 37 of 38 jars identified by hash in 3.6 s, reload from state.json in 3 ms, and the three 1.21.11 jars flagged incompatible. Checked with headless Chrome screenshots; menus and dialogs not clicked through in a browser. |
| 2026-09-22 | UI polish ahead of Phase 5: theme toggle (next-themes), server status badge, pointer cursor on controls, roomier layout (D18). Checked with headless Chrome screenshots in light and dark; the theme menu wasn't clicked through. |
| 2026-09-22 | Side is read-only when it comes from Modrinth/CurseForge; overrides only apply to local files or unknown platform sides (D19). |
| 2026-09-22 | Phase 5 done: Modrinth search/project/versions/tags with a TTL cache, best-version picker (§7.3), install plan with recursive required deps, background install job (download to `.mc-mod/tmp`, sha1+sha512 check, atomic rename, install record) with SSE progress via `streamRoute()`, web routing + Browse + project page + install dialog (D20). Checked on a copy of the dev instance: Create Aeronautics planned Sable as required and Create as installed; installs landed as `install-record`, compatible. The install dialog was clicked through with puppeteer-core (scratch only, not a dependency). |
| 2026-09-22 | Repaired `api-spec.md` (3eefe6b had inserted a section between every character). Phase 6 done: CurseForge provider (verified live; enums from the docs), global config + Settings view with key test, fingerprint identification next to Modrinth's, CurseForge search/project/versions/installs, manual-download items, CurseForge links and suggestions (D21). With the user's key (saved via the new Settings on their dev server), 33 of 39 dev-instance jars matched by fingerprint, and Mouse Tweaks installed from forgecdn on a scratch copy. That key may not use `/mods/search` at all, so CurseForge search results were only checked against fakes. Checked with headless Chrome screenshots (Settings, Browse states, project page, install and manual dialogs, link dialog). |
| 2026-09-22 | Installed and Browse side by side from 1280px with one search bar (clear button, Ctrl+K / ⌘K and `/` to focus, spinner while searching; D22). Also formatted `project-view.tsx`, which failed `bun run check` after db0f476. Checked with headless Chrome at 900, 1280, 1440 and 1920px (typing, `/`, Ctrl+K, Escape, nav keeping `?q=`), dark theme only. |
| 2026-09-22 | Page up to 1920px wide; in the split, Installed takes 3 : 2 over Browse, and narrow result cards hide author and updated time (D23). Checked with headless Chrome at 1280 and 1920px. |
| 2026-09-22 | Installed table header stays on top while scrolling (page on narrow screens, the pane in the split). Checked with headless Chrome at 1000 and 1440px. |
| 2026-09-22 | Project pages open over the Browse list, keeping the search, Installed state, Browse params and scroll (D24). Checked with headless Chrome at 1000 and 1440px: open → Back to results keeps scroll and filters, typing returns to the results, browser Back reopens the project. |
| 2026-09-22 | Toggle for the split view next to the search bar, wide screens only, remembered per browser (D25). Side column now hides below 672px, since the 5 : 4 split cut off the row menus at 1440px. Checked with headless Chrome: default on, off survives a reload, nav and Browse route follow it, no toggle at 1000px; the table fits at 1280, 1440 and 1920px. |
| 2026-09-22 | README rewritten for users (install from source, options, CurseForge key, files written, roadmap); MIT LICENSE; SECURITY.md with private reporting and the threat model. |
