# Architecture

## 1. What we are building

`mc-mod` is a globally-installed CLI that runs on Bun (`bun add -g mc-mod`). The user `cd`s into a Minecraft
instance directory (client instance, launcher profile, or server directory) and runs:

```sh
mc-mod            # detect instance, start local server, open browser
mc-mod --port 4321 --no-open
mc-mod --dir ~/servers/survival
```

The CLI starts an Express server bound to `127.0.0.1`, which serves:

- the built React SPA (static files), and
- a JSON REST API under `/api/*` that reads/writes the instance directory and
  proxies Modrinth and CurseForge.

The browser UI lets the user:

1. See installed mods/plugins (parsed from jar metadata, matched to Modrinth/CurseForge by hash).
2. Search Modrinth and CurseForge, filtered to the instance's game version + loader.
3. Install the best-matching version (with required dependencies).
4. Update, disable (`.jar` → `.jar.disabled`), and remove mods.
5. Export server-side mods to a separate directory (`./server-mods/` by default) for uploading.

## 2. Repository layout (Bun workspaces monorepo)

```
mc-mods-manager/
├── AGENTS.md
├── artifacts/                 # planning docs (this folder)
├── package.json               # root: workspaces, shared scripts
├── biome.json                 # single Biome config for the whole repo
├── tsconfig.json              # base compiler options (from bun init)
├── bun.lock
├── apps/
│   ├── web/                   # Vite + React + TS + Tailwind + shadcn (the UI)
│   └── cli/                   # Express + TS; the published `mc-mod` package
└── packages/
    └── shared/                # zod schemas + TS types shared by web & cli
```

Why this split:

- **`apps/cli` is both the CLI and the backend.** There is no separate "server" process;
  the CLI *is* the server. It is also the only package published to the npm registry.
- **`apps/web` builds to static files** which are copied into `apps/cli/dist/web` at build
  time, so the published package is self-contained (no Vite at runtime).
- **`packages/shared`** holds the zod domain schemas (`Instance`, `InstalledMod`, `ProjectHit`, ...) and the
  **API contract**: one `defineEndpoint({ method, path, params, query, body, response })` per route. The backend
  registers routes from it, and the frontend calls through it. Validation happens at runtime on both sides, with types
  inferred from the same schemas. It is bundled into the CLI build, not published. See [zod-contract.md](zod-contract.md).

## 3. Runtime flow

```
 user shell ── mc-mod ──► apps/cli/src/bin.ts
                              │ 1. parse args (commander)
                              │ 2. detectInstance(cwd)  ─► Instance (version, loader, kind, dirs)
                              │ 3. load/create .mc-mod/ state in instance dir
                              │ 4. start Express on 127.0.0.1:<free port>
                              │ 5. open http://127.0.0.1:<port>/?t=<session token>
                              ▼
 browser (React SPA) ◄──── static files (dist/web)
        │  fetch /api/* with header X-MC-Mod-Token
        ▼
 Express routers ─► services ─► { filesystem, jar parser, Modrinth client, CurseForge client }
```

Ctrl+C in the terminal shuts the server down. The UI shows a "server disconnected" banner
if the process dies.

## 4. Backend (`apps/cli`) modules

```
apps/cli/src/
├── bin.ts                  # #!/usr/bin/env bun, commander setup
├── server.ts               # express app factory (testable without listening)
├── config.ts               # global config (~/.config/mc-mod/config.json): CF API key, defaults
├── security.ts             # token middleware, host/origin checks
├── instance/
│   ├── detect.ts           # figure out kind, MC version, loader from files on disk
│   ├── state.ts            # .mc-mod/state.json read/write (lock-ish manifest)
│   └── paths.ts            # safe path helpers (no traversal outside instance dir)
├── jar/
│   ├── read-metadata.ts    # open jar (zip), dispatch to format parsers
│   ├── formats/            # fabric, quilt, forge (mods.toml), neoforge, legacy mcmod.info,
│   │                       # bukkit plugin.yml, paper-plugin.yml, bungee.yml, velocity-plugin.json
│   └── hash.ts             # Bun.CryptoHasher sha1/sha512 (Modrinth) + murmur2 fingerprint (CurseForge)
├── providers/
│   ├── types.ts            # Provider interface (search, getProject, getVersions, resolveByHash)
│   ├── modrinth.ts
│   └── curseforge.ts
├── services/
│   ├── library.ts          # list installed, identify, enable/disable/remove
│   ├── installer.ts        # pick version, resolve deps, download, verify hash, write
│   ├── updates.ts          # check updates for identified mods
│   └── server-export.ts    # compute server-side set and copy to export dir
├── env.ts                  # zod schema for env vars + parsed CLI options
└── routes/                 # thin express routers registered via route(router, api.x.y, handler)
    ├── adapter.ts          # route() + zod error middleware
    ├── instance.ts
    ├── mods.ts
    ├── search.ts
    └── export.ts
```

Rules:
- Routes are thin: registered with `route()` from the shared contract, which does the zod validation, then call a service.
- Zod everywhere: provider responses, jar metadata, manifests, state/config files and env are all parsed with schemas.
- Services never touch `req`/`res`.
- Providers normalize platform responses into shared types; nothing outside
  `providers/` knows Modrinth/CurseForge JSON shapes.

## 5. Domain model (lives in `packages/shared`)

Shown as TS types for readability. In code, each is a zod schema, and the type is `z.infer<typeof X>`.

```ts
type Loader =
  | 'fabric' | 'quilt' | 'forge' | 'neoforge'            // mod loaders
  | 'paper' | 'spigot' | 'bukkit' | 'purpur' | 'folia'   // plugin servers
  | 'velocity' | 'bungeecord' | 'waterfall'              // proxies
  | 'vanilla';

type ContentKind = 'mod' | 'plugin';          // derived from loader
type InstanceKind = 'client' | 'server';

interface Instance {
  root: string;                // absolute path
  kind: InstanceKind;
  gameVersion: string | null;  // "1.21.4"; null => user must choose
  loader: Loader | null;
  loaderVersion: string | null;
  contentKind: ContentKind;
  contentDir: string;          // <root>/mods or <root>/plugins
  detection: { source: string; confidence: 'high' | 'medium' | 'low' }[];
}

type Side = 'client' | 'server' | 'both' | 'unknown';

interface InstalledMod {
  fileName: string;            // "sodium-fabric-0.6.0.jar"
  enabled: boolean;            // false if ".disabled"
  sha1: string; sha512: string; cfFingerprint: number;
  meta: { id?: string; name?: string; version?: string; authors?: string[];
          loaders: Loader[]; side: Side; depends: string[] };  // from jar
  sources: {                   // 0..2 entries; same file can exist on both platforms
    provider: 'modrinth' | 'curseforge'; projectId: string; versionId?: string;
    slug?: string; iconUrl?: string;
    method: 'install-record' | 'hash' | 'launcher-metadata' | 'manual' | 'suggested';
    confidence: 'high' | 'low';
  }[];
  primarySource?: 'modrinth' | 'curseforge';                    // user preference or per-mod pin
  compatibility: 'ok' | 'wrong-loader' | 'wrong-game-version' | 'unknown';
  side: Side;                  // resolved: user override > platform > jar metadata
  update?: { versionId: string; versionNumber: string };
}
```

## 6. Persisted state

Two places, both JSON, both versioned with a `schemaVersion` field:

| File | Scope | Contents |
|---|---|---|
| `~/.config/mc-mod/config.json` (XDG / `%APPDATA%` on Windows, via `env-paths`) | global | CurseForge API key, default export dir name, preferred provider, UI prefs |
| `<instance>/.mc-mod/state.json` | per instance | detection overrides (version/loader), per-mod `source` + `side` overrides, export dir, hash cache keyed by `fileName+size+mtime` |

The filesystem (`mods/`/`plugins/`) is the source of truth for *what is installed*.
`state.json` is only a cache/annotation layer; deleting it must never break anything —
mods are re-identified by hash.

## 7. Key algorithms

### 7.1 Instance detection
See [instance-detection.md](instance-detection.md). Ordered detectors, each returns partial
info + confidence; results are merged. If version or loader is still unknown, the UI shows a
setup dialog and saves the answer to `state.json`.

### 7.2 Identifying installed mods (mapping a jar to its source)

A jar file doesn't say where it was downloaded from. We identify it from its **exact bytes**, which
both platforms index. We then add information from other sources, from most to least reliable. Each result
records `method` and `confidence` so the UI can show why we think so.

| # | Method | Confidence | Needs network | Notes |
|---|---|---|---|---|
| 1 | **Own install record** | high | no | `state.json` entry written by mc-mod on install: `{ sha1 → provider, projectId, versionId }`. Only trusted if the file's sha1 still matches. |
| 2 | **Hash lookup, Modrinth** | high | yes | `POST /v2/version_files { hashes: [sha1…], algorithm: "sha1" }` → map of hash → version (has `project_id`). One request for all jars. |
| 2 | **Fingerprint lookup, CurseForge** | high | yes (API key) | `POST /v1/fingerprints/432 { fingerprints: [murmur2…] }` → `exactMatches[]` with `file.modId` + `file.id`. One request. |
| 3 | **Launcher metadata** | high (if hash/filename agrees) | no | Other tools already recorded sources: Prism/packwiz `mods/.index/*.pw.toml` (`[update.modrinth] mod-id/version` or `[update.curseforge] project-id/file-id` + hash), CurseForge app `minecraftinstance.json` `installedAddons[]` (`addonID`, `installedFile.id`, `fileName`), ATLauncher `instance.json` `launcher.mods[]` (`curseForgeProjectId`/`modrinthProject`). Very useful for CurseForge mods when **no CF API key** is set. |
| 4 | **Metadata guess** | low (suggestion only) | yes | No exact match, e.g. a dev build, a GitHub release or a repacked jar. Look up the jar's mod id (`fabric.mod.json` `id`, `mods.toml` `modId`, `plugin.yml` `name`) as a Modrinth slug/project, or search by name. Shown as "Possible match: Sodium (Modrinth)". **Never applied automatically.** The user confirms, and the result is saved as a `manual` link. |
| 5 | **Local** | — | no | Nothing matched. Shown with jar metadata and a homepage/sources link from the jar (`contact.homepage`/`sources`, `displayURL`, `website`). No updates. |

Order of evaluation per scan:
1. Hash all jars (`.jar` and `.jar.disabled`), using the size+mtime cache, so renamed files are still identified.
2. Apply #1 (own record) and #3 (launcher metadata) offline, which gives an instant first render.
3. Send the Modrinth and CurseForge bulk lookups (#2) **in parallel** for all jars, even ones already matched, to
   confirm them and to find the same file on the other platform.
4. Offer #4 suggestions for whatever is left, lazily when the user opens that row.
5. Save results to `state.json` keyed by sha1, so the next launch works offline except for update checks.

**The same jar on both platforms.** Authors often upload the identical file to Modrinth and CurseForge, so both
lookups hit. We store both in `sources[]`. `primarySource` is the user's preferred provider (setting, default Modrinth)
unless they pin one per mod. Updates and "open page" use the primary source. The other one is shown as "also on CurseForge".

**Hash matches but for a different loader/version.** The platform tells us which version the file belongs to, and we compare
its `loaders`/`game_versions` to the instance. A mismatch is shown as an "incompatible with this instance" warning, which
catches wrong jars in shared `.minecraft/mods` folders.

**Manual override.** A row menu offers "Link to project…" (search → pick project) or "Unlink / treat as local". It's saved
as `method: "manual"` and wins over #3 and #4, but not over an exact hash match that contradicts it. That case shows a conflict badge.

### 7.3 Picking "the perfect version"
For a project, fetch versions filtered by `gameVersion` + `loader`, then choose:
1. Exact game version match beats compatible-range match.
2. Release > beta > alpha (unless user toggles "allow pre-releases").
3. Newest publish date.
4. For loaders with compatibility (Quilt can run Fabric mods; Purpur/Paper can run Spigot/Bukkit plugins;
   Folia is **not** assumed compatible), fall back to compatible loaders only if no native build exists,
   and flag it in the UI.

The UI always shows the chosen version and lets the user pick another from a dropdown.

### 7.4 Dependency resolution
- Follow `required` dependencies recursively (Modrinth `dependencies[]`, CurseForge
  `relationType = 3`), applying 7.3 to each.
- Skip deps already installed (matched by project id).
- Show a confirmation list before downloading: "Installing Fabric API + 2 dependencies".
- Surface `incompatible` relations as warnings.
- Optional deps are listed but unchecked by default.

### 7.5 Install / download
- Download to `<instance>/.mc-mod/tmp/`, verify hash (sha1/sha512 for Modrinth, sha1 for CF), then atomic
  rename into the content dir.
- Filename comes from the platform, sanitized (`path.basename`, no separators, must end in `.jar`).
- If CurseForge returns `downloadUrl: null` (author disabled 3rd-party distribution), show a
  "Download manually" link to the CurseForge page instead of failing silently.
- Updating = download new file, then delete old file only after the new one is verified.

### 7.6 Server export
Target: `<instance>/server-mods/` (configurable; plugins instances don't need this, the feature is for
mod loaders).

Side resolution per mod (first hit wins):
1. User override in `state.json`.
2. Modrinth `client_side` / `server_side` (`required`/`optional`/`unsupported`).
3. Jar metadata (`fabric.mod.json` `environment`, `mods.toml` `side` on the loader/minecraft dependency, `displayTest`).
4. `unknown` → included, but highlighted for the user to decide.

Export includes `server` + `both` + `unknown` (unknown is opt-out). Client-only mods are excluded.
Export modes: **copy** (default, clears previous export first after confirmation) or **zip**
(`server-mods-<version>-<date>.zip`). Never modifies the source `mods/` dir.

## 8. Frontend (`apps/web`)

- Vite + React 19 + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui components.
- **TanStack Query** for all server state (caching, refetch after mutations). No global store needed;
  small UI state stays in components.
- Routing: a few views, so a lightweight router (**react-router** in declarative mode) with routes
  `/` (installed), `/browse`, `/project/:provider/:id`, `/export`, `/settings`.
- API client: `call(endpoint, req)` in `src/lib/api.ts` takes a shared contract endpoint, injects the session
  token, validates the body and parses the response with the endpoint's zod schema. Components never call `fetch` directly.
- Forms: shadcn `Form` (react-hook-form) with `zodResolver`, reusing the endpoint's body schema.
- Dev: Vite dev server proxies `/api` to the Express dev server (see [setup-commands.md](setup-commands.md)).

UI details: [ui-spec.md](ui-spec.md). API contract: [api-spec.md](api-spec.md).

### 8.1 UI delivery: browser, not a desktop shell
- The default is the system browser. If a Chromium-based browser is found, open it in app mode
  (`--app=<url>`) for a window with no address bar. Otherwise use a normal tab via `open`. `--browser tab|app` overrides this.
- `--no-open` prints the URL only. Useful on headless servers over SSH (`ssh -L 4719:127.0.0.1:4719 …`).
- Optional idle shutdown: the UI sends a heartbeat on `/api/health` every 10s. With `--exit-on-close`, the server exits
  after 60s without a heartbeat.
- Desktop wrapper (Electrobun first, Tauri second) is deferred. The SPA + HTTP API split lets us add one later
  without a rewrite. See D12.

## 9. Security (local server, but still a server)

- Bind to `127.0.0.1` only, never `0.0.0.0`.
- Random 32-byte session token generated per run; passed in the opened URL (`?t=`), stored in
  `sessionStorage`, sent as `X-MC-Mod-Token` on every `/api` request. Requests without it get 401.
  This blocks other websites / local processes' browser tabs from driving the API (CSRF / DNS rebinding).
- Validate `Host` header is `127.0.0.1:<port>` or `localhost:<port>`.
- All file operations go through `instance/paths.ts`, which resolves and asserts the result stays inside the
  instance root (or the configured export dir).
- CurseForge API key never sent to the browser; the backend proxies all CF calls.
- Only download from `cdn.modrinth.com`, `edge.forgecdn.net`, `mediafilez.forgecdn.net` (allowlist).

## 10. Build & distribution

- `bun run build` at root: build `apps/web` (Vite via `bunx --bun`) → bundle `apps/cli` (`bun build --target=bun`, inlines shared) →
  copy `apps/web/dist` into `apps/cli/dist/web`.
- `apps/cli/package.json` has `"bin": { "mc-mod": "./dist/bin.js" }`, `"files": ["dist"]`.
- Local testing: `cd apps/cli && bun link`, then run `mc-mod` in any instance dir.
- Publish with `bun publish`. Optional later: `bun build --compile` standalone binaries that embed the web assets.
- Target runtime: Bun ≥ 1.3 (ESM only). Toolchain is Bun only; see D11 in decisions.md.

## 11. Non-goals (v1)

- Launching Minecraft or managing loader installation.
- Modpack import/export (`.mrpack`, CF zip) — candidate for v2.
- Resource packs / shaders / datapacks — candidate for v2 (Modrinth supports them, model allows it).
- Remote/SFTP upload to server — v1 only prepares a folder/zip.
