# External APIs

All platform calls happen in `apps/cli/src/providers/*`. The browser never talks to Modrinth
or CurseForge directly (keeps the CF key secret, keeps one normalization layer, avoids CORS issues).

Verify endpoints against the live docs before implementing each one — APIs drift.

## Modrinth — https://docs.modrinth.com/api/

- Base: `https://api.modrinth.com/v2`. No key required for read.
- **Required** header: `User-Agent` (`USER_AGENT` in `providers/modrinth.ts`, currently
  `mc-mod/<version> (mc-mods-manager; local Minecraft mod manager)`). Generic UAs may be blocked. Add the repo URL
  once it is public (open-questions.md #11).
- Rate limit: 300 req/min per IP. Read `X-Ratelimit-Remaining` / `X-Ratelimit-Reset`; back off on 429.

| Use | Endpoint |
|---|---|
| Search | `GET /search?query=&facets=[["project_type:mod"],["versions:1.21.4"],["categories:fabric"]]&index=relevance&offset=&limit=` |
| Plugins search | same, `project_type:plugin`, `categories:paper` (etc.) |
| Project | `GET /project/{id|slug}` (includes `client_side`, `server_side`) |
| Bulk projects | `GET /projects?ids=[...]` |
| Versions | `GET /project/{id}/version?loaders=["fabric"]&game_versions=["1.21.4"]` |
| Version | `GET /version/{id}` |
| Identify by hash (bulk) | `POST /version_files` `{ hashes: [...], algorithm: "sha1" }` |
| Updates (bulk) | `POST /version_files/update` `{ hashes, algorithm, loaders, game_versions }` |
| Game versions list | `GET /tag/game_version` |
| Loaders list | `GET /tag/loader` |

Notes:
- `facets` is a JSON-encoded array of arrays: inner arrays are OR, outer array is AND.
- Version `files[]` has `primary: true` on the file to download; `hashes.sha1/sha512` for verification.
- `dependencies[].dependency_type`: `required | optional | incompatible | embedded`.
- **Side info:** versions have an `environment` field and projects an `environment[]` list (verified 2026-09-22):
  `client_and_server`, `client_only`, `client_only_server_optional`, `singleplayer_only`, `server_only`,
  `server_only_client_optional`, `dedicated_server_only`, `client_or_server`, `client_or_server_prefers_both`, `unknown`.
  We prefer the version's `environment`, then the project's list, then the legacy `client_side`/`server_side`.
  "Optional on the other side" maps to `both`, so server exports keep it. Mapping: `environmentSide()` in `providers/modrinth.ts`.
- `POST /version_files` returns a map keyed by the requested hash; hashes Modrinth doesn't know are left out.
- Search (verified 2026-09-22): `index` is `relevance | downloads | follows | newest | updated`; the response has
  `hits`, `offset`, `limit`, `total_hits`. Hits of `project_type:plugin` searches can report `project_type: "mod"`
  (plugins are mods with plugin loaders), so don't filter on the hit's type. `display_categories` holds loaders + categories.
- Versions: `GET /project/{id}/version?include_changelog=false` keeps the list small. `GET /versions?ids=[…]` for
  bulk. `version_type` is `release | beta | alpha`; files have `url`, `size`, `hashes`.
- Loader names match ours: `fabric, quilt, forge, neoforge, paper, spigot, bukkit, purpur, folia, velocity, bungeecord, waterfall`.

## CurseForge — https://docs.curseforge.com/rest-api/

- Base: `https://api.curseforge.com/v1`. **Requires** `x-api-key` header.
- Key obtained by the user from https://console.curseforge.com/ (apply for API key). We cannot ship a key
  publicly. Store in global config or `CURSEFORGE_API_KEY` env var. **CurseForge is disabled (with an
  explanation in the UI) until a key is configured.**
- Minecraft `gameId = 432`.
- classIds: Mods `6`, Bukkit Plugins `5`, Modpacks `4471`, Resource Packs `12`, Shaders `6552`
  (fetch via `GET /categories?gameId=432&classesOnly=true` at startup rather than hard-coding if possible).
- `modLoaderType` enum: 0 Any, 1 Forge, 2 Cauldron, 3 LiteLoader, 4 Fabric, 5 Quilt, 6 NeoForge.

| Use | Endpoint |
|---|---|
| Search | `GET /mods/search?gameId=432&classId=6&searchFilter=&gameVersion=1.21.4&modLoaderType=4&sortField=2&sortOrder=desc&index=&pageSize=` |
| Mod | `GET /mods/{modId}` |
| Bulk mods | `POST /mods` `{ modIds: [...] }` |
| Files | `GET /mods/{modId}/files?gameVersion=&modLoaderType=` |
| File | `GET /mods/{modId}/files/{fileId}` |
| Download URL | `GET /mods/{modId}/files/{fileId}/download-url` |
| Identify by fingerprint | `POST /fingerprints/432` `{ fingerprints: [...] }` |
| Game versions | `GET /minecraft/version` |

Notes:
- `downloadUrl` may be `null` when the author disabled third-party distribution → the plan shows the item as `manual`
  with a Download link to the file's page. We never build a forgecdn URL by hand for such files.
- File `gameVersions[]` mixes MC versions, loader names ("Fabric", "NeoForge") and sometimes "Client"/"Server"
  — parse it, but don't treat "Server" as reliable side info.
- `dependencies[].relationType`: 1 Embedded, 2 Optional, 3 Required, 4 Tool, 5 Incompatible, 6 Include.
- File `hashes[]`: `algo` 1 = sha1, 2 = md5.
- Plugins on CurseForge (Bukkit class) have poor loader metadata; version matching falls back to `gameVersions`.

Verified 2026-09-22 against the live docs and API (with a real key):
- Enums: `modLoaderType` 0 Any, 1 Forge, 2 Cauldron, 3 LiteLoader, 4 Fabric, 5 Quilt, 6 NeoForge. `sortField` 1 Featured,
  2 Popularity, 3 LastUpdated, 4 Name, 5 Author, 6 TotalDownloads, 7 Category, 8 GameVersion, 9 EarlyAccess,
  10 FeaturedReleased, 11 ReleasedDate, 12 Rating. `releaseType` 1 Release, 2 Beta, 3 Alpha. `relationType` as above.
- Every response wraps its payload in `data`; searches and file lists add `pagination { index, pageSize, resultCount,
  totalCount }`. `pageSize` max 50 and `index + pageSize ≤ 10,000`.
- `modLoaderType` "must be coupled with gameVersion" (docs). `modLoaderTypes` takes a list; we send a JSON array
  (`[5,4]`), which the docs don't spell out and couldn't be checked (see below).
- Mods have `links.websiteUrl` (the page, e.g. `https://www.curseforge.com/minecraft/mc-mods/jei`); a file's page is
  `<websiteUrl>/files/<fileId>`. `www.curseforge.com/projects/<id>` redirects (308) to the project page.
- `GET /categories` and `GET /minecraft/version` answer **without** a key, so the key test uses `GET /games/432`.
  A bad key gets 403 (`/fingerprints` answers 401).
- **Some keys can't search**: a freshly approved key gets 403 "API Key missing or invalid" on `/mods/search` only; mods,
  files, descriptions, fingerprints and `POST /mods/featured` work. Slugs can only be resolved through search, so such keys
  need numeric project ids. mc-mod reports this separately from a rejected key (`CurseForgeSearchForbiddenError`).
- `allowModDistribution: false` example: Corail Tombstone (243707); its files have `downloadUrl: null`.
- Class ids: Mods 6, Bukkit Plugins 5 (from `/categories?classesOnly=true`).

## Caching

In-memory LRU (per process) with TTL: search 2 min, project 10 min, versions 5 min, tags 24 h.
No disk cache in v1.

## Provider interface (normalized)

```ts
interface Provider {
  id: 'modrinth' | 'curseforge';
  enabled(): boolean;
  search(q: SearchQuery): Promise<SearchResult>;           // SearchQuery has gameVersion, loader, kind, text, sort, page
  getProject(id: string): Promise<Project>;
  getVersions(id: string, f: VersionFilter): Promise<ProjectVersion[]>;
  identify(files: HashedFile[]): Promise<Map<string, Match>>; // key = fileName
  checkUpdates(matches: Match[], ctx: InstanceCtx): Promise<Map<string, ProjectVersion>>;
}
```
