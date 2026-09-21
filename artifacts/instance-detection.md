# Instance detection & jar metadata

`detectInstance(cwd)` runs detectors in order. Each detector returns a partial
`Instance` plus a `{ source, confidence }` entry. Results are merged; higher confidence wins
per field. User overrides in `.mc-mod/state.json` beat everything.

## Where can the user run `mc-mod`?

The user said "in any Minecraft version directory". In practice that means one of:

| Layout | How to recognise | Content dir |
|---|---|---|
| Vanilla launcher game dir (`.minecraft`) | `launcher_profiles.json`, `versions/` | `mods/` |
| Vanilla launcher **custom game dir per profile** | `mods/` + `options.txt` | `mods/` |
| `versions/<id>/` inside `.minecraft` | `<id>.json` next to `<id>.jar` | parent `../../mods/` (warn: shared across versions) |
| Prism / MultiMC instance | `mmc-pack.json`, `instance.cfg`; game dir is `.minecraft/` or `minecraft/` | `<game dir>/mods/` |
| CurseForge app instance | `minecraftinstance.json` | `mods/` |
| Modrinth App profile | `profile.json` (older) / app DB; fall back to `mods/` heuristics | `mods/` |
| ATLauncher | `instance.json` | `mods/` |
| Fabric/Forge/NeoForge server | `server.properties` + loader files (below) | `mods/` |
| Paper/Spigot/Purpur/Folia server | `server.properties` + `plugins/` / `paper-global.yml` / jar name | `plugins/` |
| Velocity / BungeeCord proxy | `velocity.toml` / `config.yml` with `listeners` | `plugins/` |

If the cwd is a *parent* (e.g. Prism instance root), the detector descends into the game dir.
If nothing is found, the UI starts in setup mode: pick version + loader, `mods/` gets created.

## Detectors (in order)

1. **State override** – `.mc-mod/state.json` (`confidence: high`).
2. **Launcher manifests**
   - `mmc-pack.json` → `components[]`: `net.minecraft` (version), `net.fabricmc.fabric-loader`,
     `org.quiltmc.quilt-loader`, `net.minecraftforge`, `net.neoforged`.
   - `minecraftinstance.json` → `gameVersion`, `baseModLoader.name` (e.g. `forge-47.2.0`, `fabric-0.15.0-1.20.1`).
   - `instance.json` (ATLauncher) → `id`/`minecraftVersion`, `launcher.loaderVersion`.
   - `profile.json` (Modrinth App) → `metadata.game_version`, `metadata.loader`.
3. **Vanilla version json** – `versions/<id>/<id>.json`: `inheritsFrom` = game version,
   `id`/`mainClass`/`libraries` reveal loader (`net.fabricmc:fabric-loader`, `net.neoforged`, `net.minecraftforge`,
   `org.quiltmc`). When run at `.minecraft` root with several versions, list them and let the user pick.
4. **Server files**
   - `.fabric/server/`, `fabric-server-launch.jar`, `.fabric-installer`, `fabric-server-launcher.properties`
   - `libraries/net/neoforged/neoforge/<ver>/`, `libraries/net/minecraftforge/forge/<mc>-<ver>/`,
     `run.sh`/`run.bat`, `user_jvm_args.txt`
   - `quilt-server-launch.jar`
   - `paper.yml` / `config/paper-global.yml` → Paper; `purpur.yml` → Purpur; `spigot.yml` → Spigot; `bukkit.yml` → Bukkit
   - `velocity.toml` → Velocity; BungeeCord `config.yml` with `listeners:` → BungeeCord/Waterfall
   - Game version: `version_history.json` (Paper: `currentVersion` "git-Paper-123 (MC: 1.21.4)"),
     `versions/<mc>/` folder inside server dir, or server jar name `paper-1.21.4-123.jar`.
5. **Mods heuristic** (`confidence: low`) – majority loader and game version across jar metadata in `mods/`
   (e.g. `fabric.mod.json` `depends.minecraft`, `mods.toml` minecraft `versionRange`).

Client vs server: `server.properties` / `eula.txt` present → `server`, otherwise `client`.

## Jar metadata parsers

Open jars with a zip reader (e.g. `yauzl-promise` or `fflate`) and read only the needed entries.

| Entry | Loader | Useful fields |
|---|---|---|
| `fabric.mod.json` | fabric (also valid on quilt) | `id`, `name`, `version`, `authors`, `environment` (`*`/`client`/`server`), `depends`, `icon` |
| `quilt.mod.json` | quilt | `quilt_loader.id/version/metadata`, `minecraft.environment`, `depends` |
| `META-INF/mods.toml` | forge (≥1.13) | `[[mods]] modId/version/displayName/authors`, `[[dependencies.<id>]] side`, `displayTest` |
| `META-INF/neoforge.mods.toml` | neoforge (≥1.20.5) | same as above; `type = "required"` replaces `mandatory` |
| `mcmod.info` | legacy forge (≤1.12) | JSON array: `modid`, `name`, `version`, `mcversion` |
| `plugin.yml` | bukkit/spigot/paper | `name`, `version`, `api-version`, `depend`, `softdepend`, `folia-supported` |
| `paper-plugin.yml` | paper | `name`, `version`, `api-version`, `dependencies.server` |
| `bungee.yml` | bungeecord | `name`, `version`, `depends` |
| `velocity-plugin.json` | velocity | `id`, `name`, `version`, `dependencies` |

`${file.jarVersion}` placeholders in `mods.toml` → read `META-INF/MANIFEST.MF` `Implementation-Version`.
Jars with multiple formats (multi-loader jars) report all loaders found.

## Hashes

- **sha1 / sha512** – Modrinth lookup (`/v2/version_files`).
- **CurseForge fingerprint** – MurmurHash2 (32-bit, seed 1) over the file bytes with whitespace bytes
  removed (`0x09, 0x0A, 0x0D, 0x20`). Implement in `jar/hash.ts` with unit tests against known values.

Hashing is cached in `state.json` keyed by `fileName + size + mtimeMs`.
