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
