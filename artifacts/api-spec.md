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
| GET | `/api/mods` | `InstalledMod[]` (hash-identified, with side + update info if cached) |
| POST | `/api/mods/refresh` | Re-scan dir, re-identify, returns list |
| POST | `/api/mods/check-updates` | Returns `InstalledMod[]` with `update` populated |
| PATCH | `/api/mods/:fileName` | `{ enabled?, sideOverride?, primarySource?, link?: { provider, projectId } \| null }` (rename to/from `.disabled`, set side, pin provider, manual link/unlink) |
| GET | `/api/mods/:fileName/suggestions` | Low-confidence "possible match" candidates for an unidentified jar |
| DELETE | `/api/mods/:fileName` | Delete jar (moved to `.mc-mod/trash/` for undo in v1.1) |
| POST | `/api/mods/:fileName/update` | Update to `{ versionId? }` (default: best version) |
| POST | `/api/mods/update-all` | Update every mod with an available update; streams progress (see below) |

`:fileName` is URL-encoded and validated as a plain basename present in the content dir.

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
