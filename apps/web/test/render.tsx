// Import only after `withDom()` (see dom.ts).

import { mock } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'

/** Renders with the providers the app has (queries without retries, tooltips, a router). */
export function renderApp(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

type Handler = (req: { body: unknown }) => unknown

/**
 * Replaces `fetch` with a fake `/api`: `"GET /api/trash"` → handler returning the JSON body. A handler
 * can return a `Response` for errors. Unknown routes are 404s. `calls` records `"METHOD /path"`.
 */
export function fakeApi(routes: Record<string, Handler>) {
  const calls: string[] = []
  const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.href)
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    calls.push(key)
    const handler = routes[key]
    if (!handler) {
      return Response.json({ error: { code: 'NOT_FOUND', message: key } }, { status: 404 })
    }
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const out = handler({ body })
    return out instanceof Response ? out : Response.json(out)
  })
  globalThis.fetch = Object.assign(fetchMock, { preconnect: () => {} })
  return { calls }
}
