# Decision log

Short ADRs. Add new entries at the bottom; never rewrite history — supersede instead.

### D1 — npm workspaces monorepo *(superseded by D11)* (apps/web, apps/cli, packages/shared)
Accepted. One repo, one lockfile, shared types. npm is already installed and needs no extra
tooling for contributors. pnpm/bun considered; not worth the extra requirement.

### D2 — The CLI *is* the backend
Accepted. `mc-mod` starts Express in-process and serves the built SPA. No daemon, no separate
install step. Server lives exactly as long as the terminal command.

### D3 — Filesystem is the source of truth; `.mc-mod/state.json` is a cache
Accepted. Users will add/remove jars by hand or with other launchers. We re-scan and re-identify by
hash on every load instead of trusting a lockfile.

### D4 — All platform API calls proxied through the backend
Accepted. Keeps the CurseForge key off the browser, single normalization layer, one rate-limit handler.

### D5 — CurseForge is opt-in via user-supplied API key
Accepted. CF requires a key and forbids shipping one publicly for this kind of tool. Modrinth works out of the box.

### D6 — Session token + 127.0.0.1 binding
Accepted. Local web servers are reachable by any website via the browser; the token blocks CSRF and DNS rebinding.

### D7 — TanStack Query for server state, no global state library
Accepted. Almost all state is server state.

### D8 — Biome at repo root for both frontend and backend
Accepted. User asked for Biome on the frontend; using it for the backend too avoids running two linters.
ESLint from the Vite template is removed.

### D9 — tsup for CLI build, tsx for CLI dev *(superseded by D11)*
Accepted. tsup bundles the workspace `shared` package into the CLI so the published package has no
workspace deps. Revisit if tsdown becomes the obvious successor.

### D10 — Plan → confirm → execute installs, with SSE progress
Accepted. Users see dependencies before anything is written; SSE is simpler than WebSockets for one-way progress.

### D11 — Bun only: package manager, runtime, bundler, test runner
Accepted (supersedes D1 and D9). User requirement. Bun workspaces (`bun.lock`), `bun --watch` for CLI dev,
`bun build --target=bun` for the CLI bundle (inlines `@mc-mod/shared`), `bun test` instead of Vitest,
`bunx --bun` for Vite and shadcn. The published CLI has a `#!/usr/bin/env bun` shebang, so users need Bun
installed. `bun build --compile` can later produce standalone binaries. Express stays the HTTP framework on
Bun's Node compatibility layer. `typescript` is kept only for `tsc --noEmit` type-checking.

### D12 — Browser UI (optional app-mode window), no desktop shell in v1
Accepted. The tool starts from a terminal inside the instance folder, which already identifies the instance. It
also has to work on headless servers via SSH port-forwarding. Tauri would add a Rust toolchain and break the
JS/Bun-only stack. It would also need per-OS builds, signing and auto-update. Mitigations for the "just a tab" feel: Chromium
`--app` mode and optional idle shutdown. Revisit with Electrobun if a desktop app becomes a goal.

### D13 — Zod everywhere + custom shared API contract
Accepted. All boundary data gets parsed with zod, and types are inferred from schemas. The API is a set of
`defineEndpoint` objects in `packages/shared/src/contract`, consumed by a backend `route()` adapter and a frontend
`call()` client, so request/response shapes are validated at runtime on both sides from one source.
Chose a ~40-line custom helper over ts-rest/oRPC/tRPC: no extra dependency, it keeps plain REST + Express, and it's easy
to read. Revisit if the helper starts growing features (e.g. OpenAPI generation → consider oRPC).

### D14 — Scaffolding choices made during Phase 1
Accepted.
- **TypeScript ~6.0** repo-wide, via the catalog, matching what create-vite pins. TS 7 (native compiler) is deferred until
  the tooling (Vite template, shadcn) targets it.
- **shadcn with Radix primitives + Nova preset** (Lucide icons, Geist font, neutral base). Base UI was the alternative;
  Radix was chosen for maturity and docs coverage.
- **shadcn `field` instead of `form`**. Current shadcn replaced the react-hook-form `Form` wrapper with `Field` components,
  used together with RHF `Controller` + `zodResolver`.
- **Biome style**: 2 spaces, single quotes, no semicolons (as needed), width 100. `apps/web/src/components/ui` is excluded
  so shadcn components can be regenerated without diffs.

### D15 — CLI terminal UI, port choice and dev-mode isolation
Accepted.
- **Terminal output:** `@clack/prompts` (framed intro/note/log/outro, spinners and prompts for later) + `picocolors`
  (colors, honors `NO_COLOR` and non-TTY). Commander's `--help` is colored through `configureHelp` style hooks. All
  human-facing output goes through `apps/cli/src/cli/terminal.ts`. Chosen over ink (React in the terminal, too heavy for a
  server that prints a few lines) and chalk/boxen/ora (three packages where clack covers all of it).
- **Port:** default 4719, so SSH forwarding instructions are stable. If it's taken, fall back to a random free port.
  An explicit `--port` is strict and fails if taken (the dev proxy depends on it).
- **Browser:** `auto` looks for an installed Chromium browser (Chrome, Chromium, Edge, Brave, Vivaldi) and launches it with
  `--app=<url>`; otherwise the `open` package opens a tab. On Linux without `DISPLAY`/`WAYLAND_DISPLAY` we don't try.
- **Dev mode can't reach users:** the build defines `process.env.NODE_ENV="production"`, which makes `IS_BUNDLE` a
  constant `true`, and `MC_MOD_DEV` is ignored when it is set. The shebang is `#!/usr/bin/env -S bun --no-env-file`, so
  a `.env` in the user's instance folder isn't loaded. Windows shim handling of `env -S` is unverified (Phase 9 testing).

### D16 — Instance detection details
Accepted.
- **fflate instead of yauzl-promise** for reading jars. Phase 4 reads each jar's full bytes for hashing anyway, so
  unzipping the same buffer in memory is simpler (one read, sync, no streams). Tests build jars in memory with `zipSync`,
  so there are no binary fixtures.
- **Extra version-json sources.** TLauncher's "separate directories" layout (`.minecraft/home/<id>` ↔ `versions/<id>`) and
  `launcher_profiles.json` profiles whose `gameDir` is the instance give an exact version + loader with high confidence.
  The mods heuristic only runs when these fail. At a `.minecraft` root, the most recently used profile wins (medium), and
  every modded version in `versions/` is offered as a suggestion.
- **Merge:** per field, highest confidence wins, and on a tie the earlier detector wins. The loader version is only taken from a
  finding that reports the same loader. Overrides from `state.json` count as a high-confidence finding placed first.
- **Mods heuristic:** majority loader across jars, then the game version that most of that loader's jars accept
  (candidates are the release versions named in their ranges; ties go to exact pins, then the newest). Mixed folders are
  common (the dev instance has 1.21.11 and 1.20.4 jars), and a "most jars accept" vote handles them without trusting any one jar.
- **`PUT /api/instance` replaces the overrides** instead of merging them. The UI sends the whole form, and `{}` means "back to detection".
  It re-detects before saving, so an invalid `contentDir` never reaches `state.json`.
- **Plugin metadata never sets the game version**, because `api-version` is only a minimum.

### D17 — Installed mods: identification timing, state records and compatibility rules
Accepted.
- **`GET /api/mods` waits for one bulk lookup** of jars never looked up before, instead of an offline first render plus
  a background lookup (architecture §7.2 steps 2–3). It's one request per 500 hashes: 3.6 s for 38 jars on the first
  launch, then milliseconds from `state.json`. Misses are recorded too (`checkedAt`), so unknown jars aren't looked up
  again until **Refresh**. If Modrinth can't be reached, the list still returns, with a warning. Revisit with a job + SSE if
  large packs feel slow.
- **`state.json` `mods` is keyed by sha1**: lookup results (`sources`, `checkedAt`) and user choices (`manual`, `unlinked`,
  `sideOverride`, `primarySource`). Records of removed files are pruned unless they hold a user choice, so a re-added jar
  keeps its link and side. Enabling/disabling keeps everything, because renaming doesn't change the hash, and the jar
  cache is keyed by the name without `.disabled`.
- **Side from Modrinth** prefers the per-version `environment`, then the project's `environment[]`, then legacy
  `client_side`/`server_side`. "Optional on the other side" counts as `both`, so server exports keep those mods.
- **Compatibility** uses the platform's loaders/game versions for the exact file, and falls back to the jar's own loaders
  and version range. Quilt runs Fabric builds, Paper/Purpur run Spigot/Bukkit plugins, Waterfall runs BungeeCord plugins,
  and NeoForge on 1.20.1 runs Forge mods. Plugin game versions aren't checked, since they're minimums in practice.
- **Manual links are checked against Modrinth when they're made** (404 → `NOT_FOUND`), and the title and icon are saved with
  them, so the row looks right offline.
- **Remove moves the jar to `.mc-mod/trash/<epoch ms>-<name>`** via `paths.ts` (`renameInside`, with a copy fallback for
  `EXDEV`). There's no restore UI yet.
- **Web unit tests** get their own `tsconfig.test.json` project with Bun types, and the app project excludes `*.test.ts`.

