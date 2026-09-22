import { describe, expect, test } from 'bun:test'
import { withDom } from '../test/dom'

withDom()
const { screen } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { fakeApi, renderApp } = await import('../test/render')
const { default: App } = await import('./App')

const unauthorized = () =>
  Response.json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } }, { status: 401 })

describe('App page states', () => {
  test('asks for the terminal link when the token is missing or old', async () => {
    fakeApi({ 'GET /api/instance': unauthorized, 'GET /api/health': unauthorized })
    renderApp(<App />)
    expect(await screen.findByText('Open the link from the terminal')).toBeDefined()
    expect(await screen.findByText('Not signed in')).toBeDefined()
  })

  test('shows a failed instance request with a retry', async () => {
    let fail = true
    const api = fakeApi({
      'GET /api/instance': () =>
        fail
          ? Response.json({ error: { code: 'INTERNAL', message: 'Boom' } }, { status: 500 })
          : unauthorized(),
      'GET /api/health': () => ({ ok: true, version: '1.0.0' }),
    })
    renderApp(<App />)
    expect(await screen.findByText("Couldn't load the instance")).toBeDefined()
    expect(screen.getByText('Boom')).toBeDefined()

    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Open the link from the terminal')).toBeDefined()
    expect(api.calls.filter((c) => c === 'GET /api/instance')).toHaveLength(2)
  })

  test('shows a skeleton while the instance loads', async () => {
    fakeApi({
      'GET /api/instance': () => new Promise<never>(() => {}),
      'GET /api/health': () => ({ ok: true, version: '1.0.0' }),
    })
    renderApp(<App />)
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeDefined()
  })
})
