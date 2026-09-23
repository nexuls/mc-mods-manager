import { describe, expect, test } from 'bun:test'
import type { ImportItem, ImportPlan } from '@mc-mod/shared'
import { withDom } from '../../test/dom'

withDom()
const { screen, waitFor } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { fakeApi, renderApp } = await import('../../test/render')
const { ImportDialog } = await import('./import-dialog')

const item = (over: Partial<ImportItem> & Pick<ImportItem, 'fileName' | 'title'>): ImportItem => ({
  side: 'both',
  enabled: true,
  status: 'install',
  provider: 'modrinth',
  projectId: `${over.fileName}-project`,
  versionId: `${over.fileName}-version`,
  versionNumber: '1.0',
  size: 1024,
  ...over,
})

const plan: ImportPlan = {
  createdAt: '2026-09-20T10:00:00.000Z',
  generator: { name: 'mc-mod', version: '1.0.0' },
  from: {
    kind: 'client',
    contentKind: 'mod',
    gameVersion: '1.20.1',
    loader: 'fabric',
    loaderVersion: '0.15.0',
    javaVersion: { major: 17, source: 'detected' },
  },
  to: {
    kind: 'client',
    contentKind: 'mod',
    gameVersion: '1.21.4',
    loader: 'fabric',
    loaderVersion: '0.16.9',
    javaVersion: { major: 21, source: 'detected' },
  },
  checks: [
    { label: 'game version', theirs: '1.20.1', ours: '1.21.4', match: 'differs' },
    { label: 'loader', theirs: 'Fabric', ours: 'Fabric', match: 'same' },
    { label: 'loader version', theirs: '0.15.0', ours: '0.16.9', match: 'differs' },
    { label: 'Java', theirs: 'Java 17', ours: 'Java 21', match: 'unknown' },
  ],
  items: [
    item({ fileName: 'lithium-0.14.jar', title: 'Lithium' }),
    item({ fileName: 'sodium-0.6.jar', title: 'Sodium' }),
    item({
      fileName: 'jei-19.jar',
      title: 'JEI',
      status: 'installed',
      reason: 'Installed as jei-19.0.jar',
    }),
    item({
      fileName: 'homemade.jar',
      title: 'Homemade',
      status: 'local',
      provider: undefined,
      projectId: undefined,
      versionId: undefined,
    }),
  ],
  warnings: ['The list was made for game version 1.20.1; this instance is 1.21.4.'],
}

const show = () =>
  renderApp(<ImportDialog plan={plan} fileName="pack.json" onOpenChange={() => {}} />)

describe('ImportDialog', () => {
  test('shows both instances, the warnings and every listed mod', async () => {
    fakeApi({})
    show()
    expect(await screen.findByText('Lithium')).toBeDefined()
    expect(screen.getByText(/pack.json holds 4 mods/)).toBeDefined()
    expect(screen.getByText(/1 of them is already installed/)).toBeDefined()
    expect(screen.getByText('1.20.1')).toBeDefined()
    expect(screen.getByText('1.21.4')).toBeDefined()
    expect(screen.getByText(/this instance is 1\.21\.4/)).toBeDefined()
    // Installed and local entries can't be installed from here.
    expect(screen.getByText('Installed')).toBeDefined()
    expect(screen.getByText('Local file')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Install 2 mods' })).toBeDefined()
  })

  test('installable mods start ticked and can be unticked', async () => {
    fakeApi({})
    show()
    const lithium = await screen.findByRole('checkbox', { name: 'Install Lithium' })
    expect(lithium.getAttribute('data-state')).toBe('checked')
    expect(screen.getByRole('checkbox', { name: 'Install JEI' }).hasAttribute('disabled')).toBe(
      true,
    )

    await userEvent.click(lithium)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install 1 mod' })).toBeDefined())
  })

  test('installs only the ticked mods', async () => {
    let sent: unknown
    const api = fakeApi({
      'POST /api/install': ({ body }) => {
        sent = body
        return { jobId: 'job-1' }
      },
      'GET /api/jobs/job-1/events': () =>
        new Response(
          [
            'data: {"type":"item-done","index":0,"fileName":"sodium-0.6.jar","skipped":false}\n\n',
            'data: {"type":"done","installed":1,"failed":0}\n\n',
          ].join(''),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      'GET /api/mods': () => ({ mods: [], warnings: [] }),
      'GET /api/trash': () => ({ items: [], totalSize: 0 }),
    })
    show()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Install Lithium' }))
    await userEvent.click(screen.getByRole('button', { name: 'Install 1 mod' }))

    await waitFor(() => expect(api.calls).toContain('POST /api/install'))
    expect(sent).toEqual({
      items: [
        {
          provider: 'modrinth',
          projectId: 'sodium-0.6.jar-project',
          versionId: 'sodium-0.6.jar-version',
        },
      ],
    })
  })
})
