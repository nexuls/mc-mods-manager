# REST API (local, `/api`)

All requests require header `X-MC-Mod-Token: <token>`. Every endpoint below is defined once with
`defineEndpoint` in `packages/shared/src/contract/*`. The backend validates params/query/body against it,
and the frontend validates responses against it. See [zod-contract.md](zod-contract.md). This table
summarizes that code. If they disagree, the contract code wins, and this table should be fixed. Errors use one shape (`ApiErrorSchema`):

```json
{ "error": { "code": "NOT_FOUND", "message": "Human readable", "details": {} } }
```

Error codes and their HTTP status (`errorStatus` in `contract/errors.ts`): `BAD_REQUEST` 400,
`UNAUTHORIZED` 401 (missing/wrong token), `FORBIDDEN` 403 (bad `Host` header), `NOT_FOUND` 404, `CONFLICT` 409,
`PROVIDER_ERROR` 502, `PROVIDER_DISABLED` 409, `RATE_LIMITED` 429, `HASH_MISMATCH` 502,
`MANUAL_DOWNLOAD_REQUIRED` 409, `INTERNAL` 500.

## Health & instance

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | `{ ok, version }` — UI polls every 10s to detect a dead server; doubles as the `--exit-on-close` heartbeat |
| GET | `/api/instance` | `{ instance: Instance, needsSetup }` (detected at startup; `needsSetup` when game version or loader is unknown) |
| PUT | `/api/instance` | Body `{ gameVersion?, loader?, loaderVersion?, contentDir? }` replaces the saved overrides (omitted = detect). Validated by re-detecting first (`contentDir` must stay inside the instance), then saved to `state.json`. Same response as GET |
| GET | `/api/meta/game-versions?includeSnapshots=false` | `{ versions: string[] }`, newest first (Modrinth tags, cached 24 h) |
| GET | `/api/meta/categories?kind=mod&provider=modrinth` | `{ categories: { name, label }[] }` for the Browse filter (loaders left out). `name` is the platform's slug |

The loader list isn't an endpoint: `Loader` and `loaderInfo` in `packages/shared` are the source of truth.

## Installed content

| Method | Path | Description |
|---|---|---|
| GET | `/api/mods` | `{ mods: InstalledMod[], warnings: string[] }`. Jars never looked up before are identified on the way (one bulk Modrinth sha1 request and, with a CurseForge key, one fingerprint request, in parallel); everything else comes from `state.json`. If a platform can't be reached (or rejects the key), the list still returns with a warning |
| POST | `/api/mods/refresh` | Same response; looks every jar up again |
| PATCH | `/api/mods/:fileName` | `{ enabled?, sideOverride?: Side \| null, primarySource?: Provider \| null, link?: { provider, projectId } \| null, unlinked?: boolean }` → `InstalledMod`. `enabled` renames to/from `.jar.disabled` (409 `CONFLICT` if the target exists; the response has the new `fileName`). `link` is a manual link (`projectId` is an id or slug; CurseForge needs a key, else `PROVIDER_DISABLED`, and keys that can't search only take numeric ids), `null` removes it. `unlinked: true` is "treat as local". `sideOverride` is stored, but a side from the platform wins over it |
| GET | `/api/mods/:fileName/suggestions` | `{ suggestions: ModSuggestion[] }`: "possible match" candidates for an unidentified jar (mod id as a slug, then name searches), up to 6 from Modrinth then up to 4 from CurseForge (skipped without a key or when CurseForge fails). Never applied automatically |
| DELETE | `/api/mods/:fileName` | Moves the jar to `.mc-mod/trash/<epoch ms>-<name>` → `{ fileName, trashPath }` (relative to the instance root) |
| POST | `/api/mods/check-updates` | *(Phase 7)* Returns `InstalledMod[]` with `update` populated |
| POST | `/api/mods/:fileName/update` | *(Phase 7)* Update to `{ versionId? }` (default: best version) |
| POST | `/api/mods/update-all` | *(Phase 7)* Update every mod with an available update; streams progress (see below) |

`:fileName` is URL-encoded and validated as a plain `.jar`/`.jar.disabled` basename (`ModFileName`), then it must exist in
the content dir (404 otherwise).

## Search & projects

| Method | Path | Description |
|---|---|---|
| GET | `/api/search?provider=modrinth&q=&sort=relevance&page=0` | `{ hits: ProjectHit[], total, page, pageSize, filters }`. Filters to the instance's content kind, loader (plus loaders it can run, OR'ed) and game version (mods only; plugin versions are minimums). Optional `kind`, `category`, `gameVersion`, `loader` overrides; `all=true` ("Show incompatible") drops the loader and version filters. Page size 20. CurseForge needs a key (`PROVIDER_DISABLED` without one) and caps paging at 10,000 results; a key CurseForge doesn't let search gives `PROVIDER_ERROR` with a message saying so |
| GET | `/api/projects/:provider/:id` | `Project`: description body (Markdown + HTML, render sanitized; CurseForge's is HTML), links, gallery, side (`unknown` on CurseForge). `:id` is an id or slug (CurseForge slugs are looked up by search within the instance's class, so ids are preferred) |
| GET | `/api/projects/:provider/:id/versions?all=false` | `{ versions: RankedVersion[] }`, newest first: versions for the instance's loaders and game version (`all=true`: every version), each with `compatible`, `recommended` (architecture §7.3, `services/versions.ts`) and a `note` such as `Fabric build`. `file.url` is null when the file can only be downloaded from the platform's website (`pageUrl`). CurseForge lists without `all` contain compatible files only (it filters on one loader at most) |

## Install

| Method | Path | Description |
|---|---|---|
| POST | `/api/install/plan` | `{ provider, projectId, versionId? }` → `{ items: PlanItem[], warnings[] }` (resolved deps on the same platform, what's already installed, conflicts). Item `status`: `install`, `installed`, `unavailable`, or `manual` (a fitting file the author only allows downloading from the website: `pageUrl`; its dependencies are still resolved) |
| POST | `/api/install` | `{ items: { provider, projectId, versionId }[] }` → `{ jobId }`. A manual-only file fails its item with `MANUAL_DOWNLOAD_REQUIRED` |
| GET | `/api/jobs/:id/events` | Server-Sent Events: `progress`, `item-done`, `item-failed`, `done` |

Using plan → confirm → execute keeps the UI honest about dependencies before anything touches disk.

## Server export

| Method | Path | Description |
|---|---|---|
| GET | `/api/export/preview` | `{ targetDir, include: InstalledMod[], exclude: InstalledMod[], unknown: InstalledMod[] }` |
| POST | `/api/export` | `{ mode: "copy" \| "zip", targetDir?, clean: boolean, extraInclude?: string[], extraExclude?: string[] }` → `{ path, count }` |
| POST | `/api/export/reveal` | Open the export folder in the OS file manager |

## Settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/settings` | `Settings`: `curseforgeKeySet`, `curseforgeKeySource` (`config` \| `env` \| null), `preferredProvider`, `allowPrerelease`, `exportDirName`, `configPath`. Never the key itself |
| PUT | `/api/settings` | `{ curseforgeApiKey?: string \| null, preferredProvider?, allowPrerelease?, exportDirName? }` changes only the given fields (null removes the key) and saves `config.json` (0600). Same response as GET |
| POST | `/api/settings/test-curseforge` | `{ apiKey? }` → `{ ok, message }`: checks the given key, or the one in use, with `GET /v1/games/432`, then whether it may search |
