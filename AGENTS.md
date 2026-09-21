# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo.

## Project

`mc-mod` — a CLI that, run inside a Minecraft instance or server directory, starts a local
Express server and opens a React web UI to list, search (Modrinth + CurseForge), install, update
and export (server-side) mods and plugins for that exact game version + loader.

## Read first

1. `artifacts/progress.md` — current phase and next tasks.
2. `artifacts/architecture.md` — design and module boundaries.
3. `artifacts/zod-contract.md` — validation rules + API contract pattern (mandatory).
4. The spec relevant to your task: `api-spec.md`, `ui-spec.md`, `instance-detection.md`, `external-apis.md`.

## Layout

```
apps/web         Vite + React + TypeScript + Tailwind v4 + shadcn/ui   (UI)
apps/cli         Express + TypeScript; the published `mc-mod` bin      (CLI + backend)
packages/shared  zod schemas + types shared by web and cli
artifacts/       planning docs, progress, decisions
```

## Commands

```sh
bun install              # root, installs all workspaces
bun run dev              # tmux session "mc-mod" (windows: cli on :4719, web/vite on :5173); re-run to attach
bun run dev --kill       # stop the tmux dev session
bun run dev --no-tmux    # both apps in the current terminal (automatic fallback if tmux is missing)
# Dev instance: set MC_MOD_DIR in apps/cli/.env.local (gitignored; see apps/cli/.env.example)
bun run build            # web → cli (bun build) → copy web dist into cli/dist/web
bun run check            # biome lint + format check (must pass)
bun run fix              # biome autofix
bun run typecheck        # tsc --noEmit in every workspace
bun test                 # bun:test
cd apps/cli && bun link  # then run `mc-mod` in any instance dir
```

## Bun only (strict)

- Bun is the **only** package manager, runtime, script runner, bundler and test runner.
- Never use or suggest `npm`, `npx`, `pnpm`, `yarn`, `node`, `tsx`, `ts-node`, `tsup`, `esbuild` CLI,
  `vitest`, `jest` or `supertest`. Use `bun add`, `bunx`, `bun run`, `bun build` and `bun test` instead.
- Only `bun.lock` gets committed. Delete any `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml` that appears.
- Add dependencies from inside the workspace directory (`cd apps/web && bun add x`), and reference
  internal packages with `workspace:*`.
- Run Vite and shadcn on the Bun runtime: `bunx --bun vite`, `bunx --bun shadcn@latest add <c>`.
- Prefer Bun APIs in the CLI (`Bun.file`, `Bun.write`, `Bun.CryptoHasher`, `bun:test`) over extra npm packages.
  Use `@types/bun`, not `@types/node`.

## Conventions

- **TypeScript strict, ESM everywhere.** Bun ≥ 1.3 runtime. No `any` without a comment explaining why.
- **Biome** is the only linter/formatter. Don't add ESLint or Prettier. Don't hand-edit
  `apps/web/src/components/ui/*` beyond what shadcn generates unless necessary — prefer wrapping.
- **Scaffolding uses official CLIs** (`bun create vite`, `bunx --bun shadcn@latest add`, `bunx biome init`).
  Add shadcn components with the CLI, don't copy-paste them.
- **Zod everywhere.** Every value crossing a boundary gets parsed with a zod schema: API input and output,
  SSE events, Modrinth/CurseForge responses, jar metadata, launcher manifests, `state.json`, `config.json`,
  env vars/CLI args, forms, and browser storage. Derive types with `z.infer`. Never hand-write a type that
  duplicates a schema, never `JSON.parse(x) as T`, never cast parsed data. Details: `artifacts/zod-contract.md`.
- **One shared API contract.** Every `/api` endpoint is a `defineEndpoint(...)` in
  `packages/shared/src/contract/`. The backend registers routes **only** via `route(router, api.x.y, handler)`
  (validates params/query/body, and the response in dev/test). The frontend calls **only** via
  `call(api.x.y, …)` from `apps/web/src/lib/api.ts` (validates the response). No raw `fetch('/api/…')`,
  and no `router.get('/api/…')`. New endpoint order: shared contract → cli route → web hook → `api-spec.md`.
- **Backend layering:** routes (validate + respond) → services (logic) → providers / fs / jar. Services never
  see `req`/`res`. Only `providers/*` knows Modrinth/CurseForge response shapes.
- **Frontend:** TanStack Query for all server data; invalidate queries after mutations. Tailwind utility
  classes + shadcn; no other CSS frameworks. Use the `@/` alias.
- File names: `kebab-case.ts`; React components `PascalCase` exports in `kebab-case.tsx` files (shadcn style).

## Safety rules (do not break)

- Server binds to `127.0.0.1` only. Every `/api` route requires the session token (dev bypass only under `MC_MOD_DEV=1`).
- All filesystem writes go through `apps/cli/src/instance/paths.ts` helpers that reject paths outside the
  instance root / export dir. Filenames from APIs are sanitized to a basename ending in `.jar`.
- Downloads go to `.mc-mod/tmp/`, are hash-verified, then atomically renamed. Never delete an old jar before
  its replacement is verified.
- Never send the CurseForge API key to the browser or log it.
- Always send the Modrinth `User-Agent` header defined in `providers/modrinth.ts`.
- Never write into a user's real Minecraft directory in tests — use fixtures under `apps/cli/test/fixtures/`
  copied into a temp dir.

## Workflow for agents

- Pick the next unchecked item in `artifacts/progress.md`; mark it `[~]` while working, `[x]` when done.
- Before finishing: `bun run check && bun run typecheck && bun test` must pass.
- Append a line to the session log in `progress.md`. Record any non-trivial design choice in
  `artifacts/decisions.md` (new entry, don't rewrite old ones).
- If a spec is wrong or ambiguous, fix the spec in `artifacts/` in the same change, or add it to `open-questions.md`.
- Verify external API endpoints against live docs before implementing; don't trust memory.

## Commits (always atomic)

- **Commit as you go, one logical change per commit.** Don't batch unrelated work into one commit at the end.
  Examples: "add Tailwind", "add shadcn components", "apply Biome formatting" are three commits, not one.
- Each commit must stand on its own: `bun run check && bun run typecheck && bun test` pass at that commit.
- Stage only the files that belong to that change (`git add <paths>`, not `git add -A` over unrelated edits).
  Keep mechanical changes (formatting, renames) in their own commit, separate from behavior changes.
- Include `bun.lock` in the same commit as the `package.json` change that caused it.
- Use Conventional Commits with a scope where it helps: `feat(cli): …`, `fix(web): …`, `chore(shared): …`,
  `docs: …`, `test: …`, `build: …`, `style: …`. Subject in imperative mood, ≤ 72 chars. Add a body when the *why* isn't obvious.
- Doc/progress updates for a change go in that change's commit, or in a `docs:` commit right after it.
- Never rewrite published history (no force-push, no amending pushed commits).
