# External APIs

All platform calls happen in `apps/cli/src/providers/*`. The browser never talks to Modrinth
or CurseForge directly (keeps the CF key secret, keeps one normalization layer, avoids CORS issues).

Verify endpoints against the live docs before implementing each one — APIs drift.

## Modrinth — https://docs.modrinth.com/api/

- Base: `https://api.modrinth.com/v2`. No key required for read.
- **Required** header: `User-Agent: mc-mod/<version> (github.com/<owner>/mc-mods-manager)`. Generic UAs may be blocked.
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
- `downloadUrl` may be `null` when the author disabled third-party distribution → show "Open on CurseForge" link.
- File `gameVersions[]` mixes MC versions, loader names ("Fabric", "NeoForge") and sometimes "Client"/"Server"
  — parse it, but don't treat "Server" as reliable side info.
- `dependencies[].relationType`: 1 Embedded, 2 Optional, 3 Required, 4 Tool, 5 Incompatible, 6 Include.
- File `hashes[]`: `algo` 1 = sha1, 2 = md5.
- Plugins on CurseForge (Bukkit class) have poor loader metadata; version matching falls back to `gameVersions`.

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
