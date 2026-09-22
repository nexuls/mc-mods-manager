# Security policy

## Supported versions

`mc-mod` has not had a release yet. Security fixes go to the `main` branch. Once versions are
published, only the latest release will get fixes.

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Report them privately through GitHub:
[Report a vulnerability](https://github.com/nexuls/mc-mods-manager/security/advisories/new)
(the repository's **Security** tab → **Report a vulnerability**).

Please include:

- what an attacker can do, and what they need first (for example "any website the user visits" or
  "a local user on the same machine")
- steps to reproduce, or a proof of concept
- the `mc-mod --version` output, your OS, and your Bun version
- the launcher or server type of the instance, if it matters

You should get a reply within 7 days. Once the problem is confirmed, I'll work on a fix with you,
publish a GitHub security advisory, and credit you unless you'd rather not be named.

## Threat model

`mc-mod` runs a local HTTP server that can read, write and delete files in a Minecraft instance
directory, and that holds a CurseForge API key. These protections are meant to hold, and a way around
any of them counts as a vulnerability:

- **Loopback only.** The server binds to `127.0.0.1`, never to `0.0.0.0` or another interface.
- **Session token.** Every `/api` request needs the random 32-byte token created for that run. It is
  passed to the browser in the URL that `mc-mod` opens and sent back in the `X-MC-Mod-Token` header.
  Other websites open in the same browser must not be able to call the API.
- **Host check.** Requests with a `Host` header other than `127.0.0.1:<port>` or `localhost:<port>` are
  rejected, which blocks DNS rebinding.
- **Filesystem confinement.** Writes, renames and deletes stay inside the instance directory (or the
  configured export directory). File names that come from Modrinth or CurseForge are reduced to a plain
  `.jar` basename.
- **Verified downloads.** Files are only downloaded over HTTPS from `cdn.modrinth.com`,
  `edge.forgecdn.net` and `mediafilez.forgecdn.net`. Each one is saved to `.mc-mod/tmp/`, checked
  against the hash the platform reports, and only then moved into place. An old jar is never deleted
  before its replacement has been verified.
- **The CurseForge API key stays on the server.** The API never returns it, the terminal never prints
  it, and the config file that holds it is written with `0600` permissions.
- **No development shortcuts in releases.** The token bypass for development (`MC_MOD_DEV=1`) is
  compiled out of the published bundle, and the published CLI doesn't load `.env` files from the
  directory it runs in.

## Out of scope

- Malicious mods or plugins. `mc-mod` installs what Modrinth and CurseForge serve, and it can't tell
  whether a mod's code is safe. Report malicious content to the platform that hosts it.
- Attackers who can already run code as your user, or read your files or your browser's session
  storage. They can do what `mc-mod` does without it.
- Forwarding the port to other machines (with `ssh -L`, a reverse proxy, and so on) beyond what the
  README describes.
