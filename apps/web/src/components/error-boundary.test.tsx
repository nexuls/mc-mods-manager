import { expect, spyOn, test } from 'bun:test'
import { withDom } from '../../test/dom'

withDom()
const { render, screen } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { ErrorBoundary } = await import('./error-boundary')

let broken = true
function Page() {
  if (broken) throw new Error('Cannot read properties of undefined')
  return <p>Page content</p>
}

test('shows the error instead of a blank page, and recovers on Try again', async () => {
  // React and the boundary log the error; keep the test output clean.
  const log = spyOn(console, 'error').mockImplementation(() => {})
  render(
    <ErrorBoundary>
      <Page />
    </ErrorBoundary>,
  )
  expect(screen.getByText('This page ran into a problem')).toBeDefined()
  expect(screen.getByText('Cannot read properties of undefined')).toBeDefined()

  broken = false
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(screen.getByText('Page content')).toBeDefined()
  log.mockRestore()
})
