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


### D18 — Header theme toggle, server status badge, pointer cursor
- **Theme** uses `next-themes` (already a dependency through the shadcn sonner Toaster): `attribute="class"`, default
  `system`, stored in localStorage under `mc-mod.theme`. This is the one browser-storage value not parsed with zod:
  next-themes reads and writes it itself and only applies values from its `themes` list.
- **Server status** is a header badge (Connecting / Connected / Reconnecting / Disconnected) instead of a banner. The
  health poll retries twice (1 s apart), so "Disconnected" means 3 failed requests in a row; "Reconnecting" shows during
  the retries. Polling keeps going while disconnected, so the badge recovers by itself.
- **Pointer cursor** comes from one unlayered rule in `index.css` (enabled buttons, menu items, options, tabs), since
  Tailwind v4 dropped it and shadcn items use `cursor-default` utilities. `components/ui/*` stays untouched.

### D19 — The platform's side wins over a side override
- Side precedence is platform (primary source first) > user override > jar metadata > unknown. A Modrinth/CurseForge
  side is maintained by the author, so the Installed table shows it read-only, and only local files (or files whose
  platform doesn't know the side) get the side menu.
- `PATCH sideOverride` is still accepted and stored for any file, but it's ignored while the platform has a side. So an
  older override on a now-identified file does nothing, and it comes back if the file is later treated as local.

### D20 — Search and install (Phase 5)
- **Version picking** (`services/versions.ts`): native loader build first, a compatible loader's build (Fabric on
  Quilt, Spigot on Paper…) only when there's none, then exact game version, then release > beta > alpha, then newest.
  Pre-releases aren't allowed to win yet (`ALLOW_PRERELEASE`, becomes a setting in Phase 6). Plugins also accept
  versions made for an older game version, since plugin versions are minimums; search skips the version facet for plugins
  for the same reason.
- **Dependencies:** required ones are followed recursively; optional ones are listed (unticked) for the main project
  only and aren't followed, so ticking an optional one doesn't pull in its own dependencies. Pinned `version_id`s in
  dependencies are ignored in favour of the best version for the instance (they often point at another loader or game
  version). "Installed" means a jar already identified as that Modrinth project. A loader fallback shows as the item's
  note (`Fabric build`) rather than a plan warning.
- **Installing never replaces a file.** Identical bytes count as done (`skipped`); a different file with the same name,
  or a `.disabled` copy, fails that item with `CONFLICT`. Updates (Phase 7) will handle replacement. Downloads need at
  least one platform hash, come only from allowlisted HTTPS hosts, and are cut off when much larger than announced.
- **Jobs are in memory**, one at a time per request, items installed one by one. Events are kept (and replayed to late
  or reconnecting clients) for 10 minutes after `done`; progress events are throttled to one per 150 ms per item.
- **SSE through the contract:** `api.jobs.events` is a normal `defineEndpoint` whose `response` is the schema of one
  event. `streamRoute()` registers it (so the coverage test still sees it), writes `data: <json>` per event and validates
  each one in dev/test. The web reads it with `fetch` + a small parser (`stream()` in `lib/api.ts`), because EventSource
  can't send the token header.
- **Routing:** react-router in declarative mode; Browse state (`q`, `sort`, `category`, `all`, `page`) lives in the URL,
  parsed with zod (`lib/browse.ts`). Pagination with Previous/Next rather than infinite scroll: simpler, and the page
  survives reloads.
- **Descriptions** render with react-markdown + remark-gfm, raw HTML through rehype-raw and then rehype-sanitize
  (GitHub's schema plus `<center>`). `@tailwindcss/typography` styles them.


### D21 — CurseForge and global settings (Phase 6)
- **Config:** `ConfigService` loads `config.json` from `env-paths('mc-mod').config` once per run and writes it back on
  every change (atomic, mode 0600, since it holds the key). Loose schema with per-field `.catch()` defaults, so one bad
  value doesn't reset the rest and fields from newer versions survive. `CURSEFORGE_API_KEY` wins over the saved key, and
  the UI says so. The key is write-only over the API. Theme stays in the browser (next-themes, D18), not in the config.
  The pre-release choice replaces D20's `ALLOW_PRERELEASE` constant.
- **Key test:** `GET /v1/games/432`, because `/categories` answers without a key. Saving from the UI tests first,
  so a typo can't quietly break every CurseForge call. The provider reads the key through a getter, so a new key applies
  without a restart.
- **Search can be forbidden per key.** A real, freshly approved key gets 403 on `/mods/search` only. We report that with
  its own error (`CurseForgeSearchForbiddenError`), the key test mentions it, and Browse offers "Open CurseForge
  project" for a pasted page URL or id. Slugs need search, so web links use numeric ids for CurseForge.
- **Identification:** the fingerprint lookup runs in parallel with Modrinth's for jars without `checkedAt.curseforge`,
  only when a key is set, so adding a key later looks up every jar once. A failed lookup (including a rejected key) is
  a warning, and Modrinth's results still load. Fetched projects are keyed `provider:id`.
- **Catalog and installer** pick the platform per request. CurseForge filters files on one game version and one loader
  at most, so lists without `all` are narrowed to compatible files after ranking, and multi-loader instances (Quilt,
  NeoForge 1.20.1) ask without a loader filter. At most 500 files per project, newest first. Dependencies stay on
  the project's platform (CF `relationType` 3 required, 2 optional, 5 incompatible; tools and embedded ones ignored).
- **Manual downloads:** `VersionFile.url` is nullable and versions carry `pageUrl`. A plan item with a fitting file but no
  URL is `manual` (its dependencies are still followed); only manual *dependencies* add a warning, since the main item's
  status already says it. We never build forgecdn URLs by hand for such files, because that would bypass the author's choice.
- **Side:** CurseForge has no reliable side data (the "Client"/"Server" tags aren't trusted), so CurseForge projects are
  `unknown` and the UI hides the chip for them rather than showing a warning colour.
- **Suggestions** come from both platforms (up to 6 Modrinth, then up to 4 CurseForge); CurseForge failures are skipped.
- **Web:** API errors are retried once instead of three times (a rejected key answered quickly but showed ~7 s late), and
  the page sends no referrer, which fixed imgur images in descriptions.

### D22 — Installed and Browse side by side, one search bar
- **One `LibraryView` for `/` and `/browse`.** From `xl` (1280px) it shows both lists side by side; below that, the route
  picks one. The split is decided with `matchMedia` rather than CSS `hidden`, so a narrow Installed page doesn't also run
  a catalog search it never shows. The routes stay separate so narrow screens, links and project-page "back" keep working.
- **The search text is shared and lives in `?q=`.** Installed filters on the live text; Browse reads the debounced URL
  value. The nav carries the query between the two routes. The same URL on `/` keeps Browse's provider, sort and page.
- **Each list scrolls on its own** in the split, so a long installed list and the search results can be compared at
  any depth; the page is sized to the viewport there (a fixed `100svh - 8rem`, the header plus padding).
- **Container queries** (Tailwind v4 `@container`) instead of viewport breakpoints for the table columns and result
  cards, because a pane's width depends on the split, not the window. The page max width grew from 1280px to 1536px.

### D23 — Wider page, Installed wider than Browse
- The page may be up to 1920px wide (D22 had 1536px), and the split is `3fr : 2fr` in Installed's favour, since the table
  has more columns to show than a result card. Browse keeps at least 26rem, so at 1280px its cards drop the author and
  updated time instead of cutting titles short. At 1920px Installed is wide enough for all its columns.

### D24 — Project pages open over the Browse list
- `/`, `/browse` and `/project/:provider/:id` are children of one layout route whose element is `LibraryView`, so moving
  between them never remounts it: the search text, Installed's filter and sort, and the Browse list all survive. The
  child routes render nothing; `LibraryView` reads the route with `useMatch`.
- The project covers the Browse list rather than replacing it: in the split the list is `invisible` under an absolutely
  placed project (so its own scroll is kept); below the split it's `hidden`, and the window scroll is saved and put back.
- The project URL keeps the list's params (`/project/modrinth/sodium?q=sod&page=2`), so a reload or shared link still
  has them. The list it came from (`/` or `/browse`) is in history state (zod-parsed, `/browse` when missing), which
  replaces the old `browseHref(provider)`.
- Typing in the search bar while a project is open navigates (push, not replace) back to the results, so browser Back
  reopens the project. The project header and gallery use container queries, since the pane is narrower than the window.

### D25 — The split view can be turned off
- A columns toggle next to the search bar, shown only from `xl` up; below that nothing changes. The choice is a
  per-browser convenience in localStorage (`mc-mod.split`, `on`/`off`, zod-parsed, on by default), shared through a small
  external store so the nav's double highlight follows it too (`hooks/use-split-view.ts`).
- The split layout's classes no longer hang off the `xl` breakpoint: `LibraryView` sets `data-split` when both lists
  show, and a `split:` custom variant in `index.css` applies them. With the split off on a wide screen, the page scrolls
  as it does on a narrow one.

### D26 — Update checks rank versions per project
- **The update is the version the project page would recommend** (§7.3: native loader, exact game version, release over
  pre-release unless allowed, newest). Checking ranks each identified project's versions for the instance, one versions
  request per project (6 at a time, cached 5 min), for Modrinth and CurseForge alike. Modrinth's bulk
  `POST /version_files/update` would be one request, but it picks by date alone, so it could disagree with the
  recommended version (a Fabric build on Quilt, a beta) and it only knows exact files, not manual links. On the dev
  instance (38 Modrinth projects) a fresh check takes about 1.7 s.
- **Never a downgrade:** an installed version that's newer than the pick (a beta while releases win) has no update.
  A version that doesn't fit the instance does get the one that fits, which is how the three 1.21.11 jars in the dev
  instance got their 1.21.1 builds. A jar whose installed version isn't known (manual link, launcher record without the
  file) gets none.
- **Results live in memory** for the run (`UpdateStore`, keyed by sha1) and are added to every list, so nothing stale is
  shown on the next launch. They're dropped when the loader, game version, content kind or pre-release setting changes,
  and only apply while the source they came from is still the jar's primary one.
- **Updating is a job** like installing (same events): download to `.mc-mod/tmp/`, verify, put the new file in place,
  then trash the old one. "Change version" is the same endpoint with a `versionId`, older ones included. Update all
  leaves out files that must be downloaded by hand; the dialog links to them.
- **New dependencies aren't followed** on update yet: a new version that needs another mod installs without it
  (follow-up in progress.md).

### D27 — CurseForge file tags give a side
- Replaces the side note in D21. CurseForge files now carry "Client"/"Server" environment tags, and they match
  reality (checked 2026-09-22: Sodium is "Client"; JEI, Fabric API and Create: Frogport Reworked have both). Both tags
  → `both`, one → that side, neither → unknown as before.
- The side comes from the file only (hash matches and versions). Projects, Browse hits and project pages stay
  `unknown`, because the mod endpoints don't give a project-wide side.
- Jars looked up before this keep their cached sources until the next Refresh.

### D28 — Scroll regions are ScrollPanels with edge shadows
- Every scrolling region uses the shadcn scrollbar through `components/scroll-panel.tsx`, which builds on the Radix
  primitive (with shadcn's `ScrollBar`) instead of editing `ui/scroll-area.tsx`: it needs a viewport ref, viewport
  classes and edge shadows. A shadow shows on each edge the content continues past (scroll + ResizeObserver).
- The page scrolls inside a panel below a fixed header rather than on the window, so the header's edge shadow works
  and the scrollbar matches. Code that scrolled the window uses `usePageScroll()` (the page viewport) instead.
- The Installed table and Browse results only become panels in the split view. Below it they stay plain, because a
  Radix viewport is a scroll container and would catch the table's sticky header instead of the page.
- Radix's content wrapper is `display: table`; the panel makes it a block so `truncate` works inside.
