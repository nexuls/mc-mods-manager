import { BugIcon, RotateCcwIcon } from 'lucide-react'
import { Component, type ReactNode } from 'react'
import { PageMessage } from '@/components/page-message'
import { Button } from '@/components/ui/button'

/**
 * Catches render errors in a page so the header and navigation stay usable. Give it a `key` that
 * changes on navigation (the path) to recover when the user moves to another page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <PageMessage
        icon={BugIcon}
        title="This page ran into a problem"
        destructive
        action={
          <>
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              <RotateCcwIcon />
              Try again
            </Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </>
        }
      >
        <p>Other pages still work. If it keeps happening, reload the page.</p>
        <p className="mt-2 font-mono text-xs break-all">{error.message}</p>
      </PageMessage>
    )
  }
}
