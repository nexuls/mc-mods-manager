# Open questions

Defaults below are what the plan assumes. Change them here before Phase 1 if you disagree.

1. **Package name (npm registry).** `mc-mod` is the command; the npm name `mc-mod` may be taken.
   Default: publish as `mc-mod` if free, otherwise a scoped name (`@<you>/mc-mod`) with the same bin.
2. **"Minecraft version directory" meaning.** Default: any instance/game dir or server dir (see
   instance-detection.md). Running inside `.minecraft/versions/<id>` works but warns that `.minecraft/mods`
   is shared by all versions.
3. **Shared `.minecraft/mods` across versions** (vanilla launcher without per-profile game dirs):
   support switching the target version in the UI and flag incompatible jars? Default: yes, flag only.
4. **CurseForge key.** Each user supplies their own. Default: yes (no bundled key).
5. **Server export location.** Default: `<instance>/server-mods/`, copy mode, cleaned on each export after confirmation.
6. **Resource packs / shaders / datapacks.** Default: out of scope for v1.
7. **Modpack (`.mrpack`) import/export.** Default: v2.
8. **Direct upload (SFTP/Pterodactyl) to server.** Default: v2; v1 produces folder/zip.
9. ~~Package manager.~~ Decided: Bun only (see D11).
10. **Standalone binaries.** `bun build --compile` could ship `mc-mod` without needing Bun installed.
    Default: v1 ships on npm and needs Bun (`bun add -g mc-mod`); compiled binaries are optional in Phase 9.
