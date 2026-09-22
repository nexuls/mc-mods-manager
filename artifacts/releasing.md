# Releasing

Releases are cut by one GitHub Actions workflow, [`.github/workflows/release.yml`](../.github/workflows/release.yml).
It only runs when started by hand. Nothing is published on push.

A release does all of this in one run:

1. Lint, typecheck and test.
2. Bump the version in `apps/cli/package.json`.
3. Build the npm package (`bun run build`) and compile the standalone binaries (`bun run compile --all`).
4. Smoke-test both (`--version` must print the new version) and `bun publish --dry-run`.
5. Commit `chore(release): vX.Y.Z`, add the annotated tag `vX.Y.Z`, and push both to `main` atomically.
6. Publish `mc-mod` to npm.
7. Create the GitHub release `vX.Y.Z` with the binaries, `SHA256SUMS` and generated notes.

Every release publishes to npm **and** creates a GitHub release with binaries. There's no way to do one
without the other.

## Versions

- **One source of truth:** `version` in `apps/cli/package.json` (the published package). The CLI and
  the web UI (via `/api/health`) get it from there at build time. The root, `apps/web` and
  `packages/shared` are private and stay at `0.0.0`.
- [Semantic versioning](https://semver.org). While the major version is `0`, minor bumps can break things.
- Tags are `v<version>`, for example `v0.1.0`.
- Prereleases (`1.0.0-beta.0`) go to the npm dist-tag `next` (so `bun add -g mc-mod` still installs the
  latest stable) and are marked as prereleases on GitHub. Stable versions go to `latest`.
- Don't edit the version by hand in a normal commit. Let the workflow bump it. To try a bump locally:
  `bun run bump minor` (then `git checkout apps/cli/package.json`).

## One-time setup

1. **npm token.** On npmjs.com: Access Tokens → Generate New Token → Granular Access Token, with
   read and write access to packages (it must be allowed to create the `mc-mod` package for the first
   release; after that it can be limited to `mc-mod`). Save it as the repository secret `NPM_TOKEN`
   (Settings → Secrets and variables → Actions).
2. **Workflow permissions.** Settings → Actions → General → Workflow permissions: "Read and write
   permissions". The workflow also asks for `contents: write` itself.
3. **Branch protection.** If `main` is protected, let GitHub Actions push to it (add it to the bypass
   list of the rule or ruleset), or the push of the release commit fails.

## Cutting a release

Actions → **Release** → Run workflow, on `main`:

| Input | What it does |
|---|---|
| `bump` | `patch`, `minor`, `major`, or `prepatch` / `preminor` / `premajor` / `prerelease` |
| `version` | An exact version instead, like `1.0.0`. Must be higher than the current one |
| `preid` | The prerelease id for `pre*` bumps (default `beta`: `0.2.0-beta.0`) |
| `dry_run` | Does steps 1–4, then uploads the binaries and notes as a workflow artifact. Pushes, publishes and releases nothing. Works on any branch |

Start with a dry run when the release process itself changed.

The notes group Conventional Commits since the previous tag: breaking changes (`feat!:`), features,
fixes, performance, then everything else folded away. Write commit subjects with that in mind.

## If a run fails

- **Before step 5** (checks, build, compile, dry run): nothing was pushed or published. Fix it and run again.
- **At step 5** (push rejected, usually because `main` moved while the run was going): nothing was
  published. Run it again.
- **At step 6 or 7:** the tag is already pushed, so a new run would pick the next version. Finish this
  one by hand from the tag instead:

  ```sh
  git fetch --tags && git checkout vX.Y.Z
  bun install --frozen-lockfile && bun run build && bun run compile --all
  (cd apps/cli && bun publish --access public --tag latest)   # if npm didn't get it; `next` for prereleases
  bun scripts/release-notes.ts X.Y.Z > notes.md
  gh release create vX.Y.Z dist/release/* --verify-tag --title "mc-mod vX.Y.Z" --notes-file notes.md
  ```

npm never allows the same version to be published twice, even after unpublishing, so a broken release
is fixed by a new patch release, not by replacing it.

## Local builds

```sh
bun run build                          # npm package in apps/cli (dist/, README.md, LICENSE)
bun run compile                        # binary for this machine in dist/release/
bun run compile --all                  # every target: linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64
(cd apps/cli && bun publish --dry-run) # what would be published (needs a login, or NPM_CONFIG_TOKEN set to anything)
```

The binaries are built with `bun build --compile` and embed the web UI (see `scripts/compile.ts`).
x64 targets use Bun's baseline build, which runs on CPUs without AVX2. They're about 60–100 MB,
because each one contains the Bun runtime.
