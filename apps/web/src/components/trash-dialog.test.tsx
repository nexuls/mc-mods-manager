import { describe, expect, test } from 'bun:test'
import type { TrashResponse } from '@mc-mod/shared'
import { withDom } from '../../test/dom'

withDom()
const { screen, waitFor } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { fakeApi, renderApp } = await import('../../test/render')
const { TrashDialog } = await import('./trash-dialog')

const trash: TrashResponse = {
  items: [
    {
      id: '1790000000000-sodium-0.6.0.jar',
      fileName: 'sodium-0.6.0.jar',
      trashedAt: new Date(1_790_000_000_000).toISOString(),
      size: 2048,
    },
    {
      id: '1780000000000-jei-19.0.jar.disabled',
      fileName: 'jei-19.0.jar.disabled',
      trashedAt: new Date(1_780_000_000_000).toISOString(),
      size: 1024,
    },
  ],
  totalSize: 3072,
}

const show = () => renderApp(<TrashDialog open onOpenChange={() => {}} contentLabel="mods" />)

describe('TrashDialog', () => {
  test('lists trashed jars with their size and state', async () => {
    fakeApi({ 'GET /api/trash': () => trash })
    show()
    expect(await screen.findByText('sodium-0.6.0.jar')).toBeDefined()
    // Disabled jars show their jar name and say so.
    expect(screen.getByText('jei-19.0.jar')).toBeDefined()
    expect(screen.getByText(/1\.0 KB · disabled/)).toBeDefined()
    expect(screen.getByText('2 files · 3.0 KB')).toBeDefined()
  })

  test('restores one jar', async () => {
    const api = fakeApi({
      'GET /api/trash': () => trash,
      'POST /api/trash/1790000000000-sodium-0.6.0.jar/restore': () => ({
        fileName: 'sodium-0.6.0.jar',
      }),
    })
    show()
    await screen.findByText('sodium-0.6.0.jar')
    const [first] = screen.getAllByRole('button', { name: 'Restore' })
    await userEvent.click(first as HTMLElement)
    await waitFor(() =>
      expect(api.calls).toContain('POST /api/trash/1790000000000-sodium-0.6.0.jar/restore'),
    )
    // The list and the installed mods are fetched again.
    await waitFor(() => expect(api.calls.filter((c) => c === 'GET /api/trash')).toHaveLength(2))
  })

  test('empties the trash only after a confirm', async () => {
    const api = fakeApi({
      'GET /api/trash': () => trash,
      'DELETE /api/trash': () => ({ removed: 2, freedBytes: 3072 }),
    })
    show()
    await screen.findByText('sodium-0.6.0.jar')
    // happy-dom reads the pointer-events Radix puts on the page behind a nested dialog as inherited.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByRole('button', { name: /Empty trash/ }))
    expect(await screen.findByText('Empty the trash?')).toBeDefined()
    expect(api.calls).not.toContain('DELETE /api/trash')

    await user.click(screen.getByRole('button', { name: 'Delete for good' }))
    await waitFor(() => expect(api.calls).toContain('DELETE /api/trash'))
  })

  test('says when the trash is empty', async () => {
    fakeApi({ 'GET /api/trash': () => ({ items: [], totalSize: 0 }) })
    show()
    expect(await screen.findByText('The trash is empty')).toBeDefined()
    const empty = screen.getByRole('button', { name: /Empty trash/ })
    expect(empty.hasAttribute('disabled')).toBe(true)
  })

  test('shows a failed request', async () => {
    fakeApi({
      'GET /api/trash': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'Disk on fire' } }, { status: 500 }),
    })
    show()
    expect(await screen.findByText('Disk on fire')).toBeDefined()
  })
})
