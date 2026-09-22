# Zod everywhere & the shared API contract

## Rule

**Every value that crosses a trust or process boundary is parsed with a zod schema.** TypeScript types
for such data are *derived* from schemas with `z.infer` / `z.input`, never written by hand next to them.
Use Zod v4 (`import { z } from 'zod'`), and the same version in every workspace.

| Boundary | Where the schema lives | Parsed in |
|---|---|---|
| API request params / query / body | `packages/shared/src/contract/*` | backend route adapter |
| API responses (incl. errors) | `packages/shared/src/contract/*` | frontend API client (and backend in dev/test) |
| SSE event payloads | `packages/shared/src/contract/jobs.ts` | frontend event stream helper |
| Domain model (`Instance`, `InstalledMod`, `Loader`, `Side`, …) | `packages/shared/src/domain/*` | reused by contract + backend |
| Modrinth / CurseForge responses | `apps/cli/src/providers/<name>.schemas.ts` (private, not shared) | provider clients |
| Jar metadata (`fabric.mod.json`, `mods.toml`, `plugin.yml`, …) | top of each `apps/cli/src/jar/formats/*.ts` | jar parsers (use `safeParse`, since broken jars are common) |
| Launcher manifests (`mmc-pack.json`, `minecraftinstance.json`, …) | top of each `apps/cli/src/instance/detectors/*.ts` | detectors (`safeParse`) |
| `.mc-mod/state.json`, global `config.json` | `packages/shared/src/domain/state.ts`, `config.ts` | backend (with `schemaVersion` migrations) |
| CLI args + env vars (`--port`, `CURSEFORGE_API_KEY`, `MC_MOD_DEV`) | `apps/cli/src/env.ts` | `bin.ts` at startup (commander parses, zod validates) |
| Forms (instance setup, settings) | shared request schema, reused | react-hook-form + `@hookform/resolvers/zod` (shadcn `Field`) |
| `sessionStorage` / `localStorage` / URL search params | `apps/web/src/lib/storage.ts` | on read (`safeParse`, fall back to default) |

Rules of thumb:
- `parse` where bad data is a bug (API bodies, own state); `safeParse` where bad data is expected (third-party
  jars, manifests, storage) and degrade gracefully.
- Keep third-party schemas **loose** (`z.looseObject`, only the fields we use) so new upstream fields don't break us.
  Keep our own contract schemas **strict** (`z.strictObject`) so typos fail fast.
- No `as` casts on parsed data, and no `JSON.parse(x) as T`. Parse it instead.
- Use `z.enum`, not TS `enum` or string unions defined on their own.

## Contract shape

`packages/shared` layout:

```
packages/shared/src/
├── index.ts
├── domain/            # Loader, Side, Instance, InstalledMod, ProjectHit, ProjectVersion, State, Config …
└── contract/
    ├── define.ts      # defineEndpoint() + types
    ├── errors.ts      # ApiError schema + error codes
    ├── instance.ts
    ├── mods.ts
    ├── projects.ts    # search, project pages, versions
    ├── meta.ts        # game versions, categories
    ├── query.ts       # QueryBool / QueryInt for query-string values
    ├── install.ts
    ├── jobs.ts        # SSE event union
    ├── export.ts
    ├── settings.ts
    └── index.ts       # export const api = { instance, mods, search, … }
```

A small custom helper, with no ts-rest or oRPC dependency. It's about 40 lines and easy to understand:

```ts
// contract/define.ts
import { z } from 'zod';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Endpoint<
  P extends z.ZodType = z.ZodType, Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType, R extends z.ZodType = z.ZodType,
> {
  method: Method;
  path: string;          // express-style, e.g. '/api/mods/:fileName'
  params: P; query: Q; body: B; response: R;
}

const none = z.strictObject({});

export const defineEndpoint = <
  P extends z.ZodType = typeof none, Q extends z.ZodType = typeof none,
  B extends z.ZodType = typeof none, R extends z.ZodType = z.ZodType,
>(e: { method: Method; path: string; params?: P; query?: Q; body?: B; response: R }) =>
  ({ params: none, query: none, body: none, ...e }) as Endpoint<P, Q, B, R>;

export type Req<E extends Endpoint> = {
  params: z.input<E['params']>; query: z.input<E['query']>; body: z.input<E['body']>;
};
export type Res<E extends Endpoint> = z.output<E['response']>;
```

```ts
// contract/mods.ts
export const updateMod = defineEndpoint({
  method: 'PATCH',
  path: '/api/mods/:fileName',
  params: z.strictObject({ fileName: FileName }),
  body: z.strictObject({ enabled: z.boolean().optional(), sideOverride: Side.nullable().optional() }),
  response: InstalledMod,
});
```

### Backend adapter (`apps/cli/src/routes/adapter.ts`)

```ts
export function route<E extends Endpoint>(router: Router, e: E,
  handler: (input: { params: z.output<E['params']>; query: z.output<E['query']>; body: z.output<E['body']> },
            ctx: Ctx) => Promise<Res<E>>) {
  router[e.method.toLowerCase() as Lowercase<Method>](e.path, async (req, res, next) => {
    try {
      const input = {
        params: e.params.parse(req.params),
        query: e.query.parse(req.query),
        body: e.body.parse(req.body ?? {}),
      };
      const out = await handler(input, ctxFrom(req));
      res.json(isDevOrTest ? e.response.parse(out) : out);   // catch contract drift early
    } catch (err) { next(err); }                               // ZodError → 400 BAD_REQUEST via error middleware
  });
}
```

- Routers register endpoints only through `route()`. Never call `router.get(...)` directly for `/api`.
- The error middleware maps `ZodError` → `400 BAD_REQUEST` with `z.flattenError(err)` in `details`, and
  `AppError(code)` → the matching status. The body always matches `ApiErrorSchema`.
- A test walks the `api` contract object and checks that every endpoint is registered, so none are left orphaned.

### Frontend client (`apps/web/src/lib/api.ts`)

```ts
export async function call<E extends Endpoint>(e: E, req: Partial<Req<E>> = {}): Promise<Res<E>> {
  const url = buildUrl(e.path, req.params, req.query);          // fills :params, encodes query
  const r = await fetch(url, {
    method: e.method,
    headers: { 'X-MC-Mod-Token': token(), ...(req.body ? { 'Content-Type': 'application/json' } : {}) },
    body: req.body ? JSON.stringify(e.body.parse(req.body)) : undefined,
  });
  const json: unknown = await r.json();
  if (!r.ok) throw new ApiClientError(ApiErrorSchema.parse(json));
  return e.response.parse(json);
}
```

TanStack Query hooks wrap `call`, for example `useQuery({ queryKey: ['mods'], queryFn: () => call(api.mods.list) })`.
Never `fetch('/api/...')` directly in components.

## Adding an endpoint (checklist)

1. Add or extend domain schemas in `shared/src/domain` if needed.
2. `defineEndpoint(...)` in the right `shared/src/contract/*.ts` file and export it through `api`.
3. `route(router, api.x.y, handler)` in `apps/cli/src/routes`.
4. Call it via `call(api.x.y, …)` from a hook in `apps/web`.
5. Update the table in `artifacts/api-spec.md`.
