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
| DELETE | `/api/mods/:fileName` | Moves the jar to `.mc-mod/trash/<epoch ms>-<name>` → `{ fileName, trashPath, trashId }` (`trashPath` relative to the instance root; `trashId` for `/api/trash`) |
| POST | `/api/mods/check-updates` | `ModsResponse` with `update` set on jars whose primary source has a newer fitting version: the version the project page would recommend (architecture §7.3), one versions request per project, 6 at a time. Never a downgrade; a jar whose installed version doesn't fit the instance gets the one that does; jars without a known version (manual links) get none. Results are kept in memory for this run, so `GET /api/mods` includes them, until the loader, game version or pre-release setting changes. Unreachable platforms and CurseForge jars without a key are warnings. `update.manual` means the file must be downloaded by hand from `update.pageUrl` |
| POST | `/api/mods/:fileName/update` | `{ versionId? }` → `{ jobId, items: UpdateJobItem[] }`. Replaces the jar with that version of its primary source's project ("Change version", older too), or without `versionId` with the update found by the last check (else the best version now). 409 `CONFLICT` when it's up to date, already that version, or not linked to a project. Follow the job with `/api/jobs/:id/events` |
| POST | `/api/mods/update-all` | `{ fileNames? }` → `{ jobId, items }`: every jar with a (non-manual) update from the last check, or only the given ones. 409 when there's nothing to update. Each item downloads to `.mc-mod/tmp/`, is verified, lands in the content dir (disabled if the old jar was), and only then is the old jar moved to `.mc-mod/trash/`; its side override and pinned provider carry over |

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
| POST | `/api/install` | `{ items: { provider, projectId, versionId }[] }` → `{ jobId }`, 1..`INSTALL_BATCH_LIMIT` items (the same cap as `ModList.mods`, so a whole shared list fits in one job). A manual-only file fails its item with `MANUAL_DOWNLOAD_REQUIRED` |
| GET | `/api/jobs/:id/events` | Server-Sent Events: `progress`, `item-done`, `item-failed`, `done` |

Using plan → confirm → execute keeps the UI honest about dependencies before anything touches disk.

## Server export

| Method | Path | Description |
|---|---|---|
| GET | `/api/export/preview?dirName=` | `{ dir, dirName, zipName, include: InstalledMod[], unknown: InstalledMod[], exclude: InstalledMod[], existingJars: string[] }` (`.jar` files in the folder now). `include` is enabled `server`/`both`, `unknown` enabled unknown-side, `exclude` client-only and disabled. `dirName` defaults to the `exportDirName` setting. BAD_REQUEST on plugin instances |
| POST | `/api/export` | `{ mode: "copy" \| "zip", dirName?, clean: boolean, exclude?: fileName[] }` → `{ mode, path, count, removed }`. Copy writes `<instance>/<dirName>/` (clean removes other `.jar` files there, after the copy); zip writes `<instance>/<dirName>-<gameVersion>-<YYYY-MM-DD>.zip`. `exclude` leaves `include`/`unknown` jars out this time. The folder must not be or hold the mods folder (BAD_REQUEST); one export at a time (CONFLICT) |
| POST | `/api/export/reveal` | `{ mode, dirName? }` → `{ opened, path }`: opens the export folder (copy) or the instance root (zip) in the OS file manager. `opened` is false without a desktop; NOT_FOUND before the first export |

Moving an unknown or local mod between groups for good is a side override (`PATCH /api/mods/:fileName`), not an export option.

## Share (mod lists)

A mod list file is `{ format: "mc-mod/mod-list", formatVersion, createdAt, generator, instance, mods[] }`;
`instance` carries the kind, content kind, game version, loader, loader version and Java version
(`{ major, source: "detected" | "game-version" }`), and each entry is
`{ fileName, name, version?, enabled, side, size, sha1?, source? }`. Files travel between mc-mod versions,
so the schemas drop unknown fields instead of refusing them.

| Method | Path | Description |
|---|---|---|
| GET | `/api/share/export` | The instance and every jar in its folder as a `ModList`. The browser saves it as `mc-mod-<loader>-<version>-<date>.json` |
| POST | `/api/share/import` | `{ list: ModList }` → `{ createdAt, generator, from, to, checks[], items[], bridges[], warnings[] }`. Read-only. Each item carries up to two candidates — `shared` (the build the list pinned) and `best` (the best build for this instance) — each `{ versionId, versionNumber?, size?, compatible, bridge?, manual, pageUrl?, note? }`; `importCandidate(item, mode)` in the contract picks between them for `mode` `shared` (the default) or `best`. Item `status`: `install`, `installed` (same file or another version of the project), `manual`, `incompatible` (a file exists but nothing fits; installable anyway), `unavailable` (nothing to download, or CurseForge has no key), `local` (not on a platform). BAD_REQUEST for a list from a newer `formatVersion` |

Installing the ticked items is the normal `POST /api/install`, so downloads, hashes and job progress work the same.

## Trash

`.mc-mod/trash/` holds jars that were removed or replaced by an update, as `<epoch ms>-<file name>` (the trash id).
Other files there are ignored and never deleted.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/trash` | `{ items: { id, fileName, trashedAt, size }[], totalSize }`, newest first |
| POST | `/api/trash/:id/restore` | Moves it back into the content folder under its old name (disabled stays disabled) → `{ fileName }`. CONFLICT when that jar is there, enabled or disabled |
| DELETE | `/api/trash/:id` | Deletes it for good → `{ id }` |
| DELETE | `/api/trash` | Deletes every trashed jar for good → `{ removed, freedBytes }` |

## Settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/settings` | `Settings`: `curseforgeKeySet`, `curseforgeKeySource` (`config` \| `env` \| null), `preferredProvider`, `allowPrerelease`, `exportDirName`, `configPath`. Never the key itself |
| PUT | `/api/settings` | `{ curseforgeApiKey?: string \| null, preferredProvider?, allowPrerelease?, exportDirName? }` changes only the given fields (null removes the key) and saves `config.json` (0600). Same response as GET |
| POST | `/api/settings/test-curseforge` | `{ apiKey? }` → `{ ok, message }`: checks the given key, or the one in use, with `GET /v1/games/432`, then whether it may search |
