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
| GET | `/api/meta/game-versions` | Release list (from Modrinth tags), with `includeSnapshots` query |
| GET | `/api/meta/loaders` | Supported loaders + whether each is mod/plugin |

## Installed content

| Method | Path | Description |
|---|---|---|
| GET | `/api/mods` | `{ mods: InstalledMod[], warnings: string[] }`. Jars never looked up before are identified on the way (one bulk Modrinth request); everything else comes from `state.json`. If Modrinth can't be reached, the list still returns with a warning |
| POST | `/api/mods/refresh` | Same response; looks every jar up again |
| PATCH | `/api/mods/:fileName` | `{ enabled?, sideOverride?: Side \| null, primarySource?: Provider \| null, link?: { provider, projectId } \| null, unlinked?: boolean }` → `InstalledMod`. `enabled` renames to/from `.jar.disabled` (409 `CONFLICT` if the target exists; the response has the new `fileName`). `link` is a manual link (Modrinth only until Phase 6: CurseForge gives `PROVIDER_DISABLED`), `null` removes it. `unlinked: true` is "treat as local". `sideOverride` is stored, but a side from the platform wins over it |
| GET | `/api/mods/:fileName/suggestions` | `{ suggestions: ModSuggestion[] }`: "possible match" candidates for an unidentified jar (mod id as a Modrinth slug, then name searches). Never applied automatically |
| DELETE | `/api/mods/:fileName` | Moves the jar to `.mc-mod/trash/<epoch ms>-<name>` → `{ fileName, trashPath }` (relative to the instance root) |
| POST | `/api/mods/check-updates` | *(Phase 7)* Returns `InstalledMod[]` with `update` populated |
| POST | `/api/mods/:fileName/update` | *(Phase 7)* Update to `{ versionId? }` (default: best version) |
| POST | `/api/mods/update-all` | *(Phase 7)* Update every mod with an available update; streams progress (see below) |

`:fileName` is URL-encoded and validated as a plain `.jar`/`.jar.disabled` basename (`ModFileName`), then it must exist in
the content dir (404 otherwise).

## Search & projects

| Method | Path | Description |
|---|---|---|
| GET | `/api/search?provider=modrinth&q=&sort=relevance&page=0&kind=mod` | Uses instance version/loader by default; overrides via `gameVersion`, `loader` |
| GET | `/api/projects/:provider/:id` | Project details (description body, links, side info, gallery) |
| GET | `/api/projects/:provider/:id/versions?all=false` | Compatible versions (all=true ignores filters), with `recommended: true` on the best pick |

## Install

| Method | Path | Description |
|---|---|---|
| POST | `/api/install/plan` | `{ provider, projectId, versionId? }` → `{ items: PlanItem[], warnings[] }` (resolved deps, what's already installed, conflicts) |
| POST | `/api/install` | `{ items: { provider, projectId, versionId }[] }` → job id |
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
| GET | `/api/settings` | Global config, with `curseforgeKeySet: boolean` (never the key itself) |
| PUT | `/api/settings` | Update config; `curseforgeApiKey` write-only |
| POST | `/api/settings/test-curseforge` | Validates key with a cheap CF request |
