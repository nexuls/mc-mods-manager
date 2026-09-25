import { LockKeyholeIcon, RotateCwIcon, UnplugIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, ViewTransition } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AppHeader } from '@/components/app-header'
import { AppNav } from '@/components/app-nav'
import { ErrorBoundary } from '@/components/error-boundary'
import { ExportView } from '@/components/export-view'
import { InstanceDialog } from '@/components/instance-dialog'
import { LibraryView } from '@/components/library-view'
import { PageMessage } from '@/components/page-message'
import { ScrollPanel } from '@/components/scroll-panel'
import { SettingsView } from '@/components/settings-view'
import { ShareView } from '@/components/share-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useInstance } from '@/hooks/use-instance'
import { useMods } from '@/hooks/use-mods'
import { PageScrollContext } from '@/hooks/use-page-scroll'
import { useSettings } from '@/hooks/use-settings'
import { ApiClientError, errorMessage } from '@/lib/api'

function App() {
  const instance = useInstance()
  const [editing, setEditing] = useState(false)
  const page = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  const unauthorized =
    instance.error instanceof ApiClientError && instance.error.code === 'UNAUTHORIZED'
  const ready = instance.data && !instance.data.needsSetup ? instance.data.instance : null

  // LibraryView restores its own scroll (a project opens at the top, the list returns where it was);
  // every other page starts at the top, so a swap never cross-fades one page's middle with another's.
  useLayoutEffect(() => {
    if (!inLibrary(pathname)) page.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    // The header stays put and the page scrolls below it, so content slides under its edge shadow.
    <div className="flex h-svh flex-col">
      <AppHeader onEditInstance={() => setEditing(true)} />
      <PageScrollContext value={page}>
        <ScrollPanel
          viewportRef={page}
          className="min-h-0 flex-1"
          viewportClassName="[&>div]:flex! [&>div]:min-h-full [&>div]:flex-col"
        >
          <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col gap-6 px-6 py-8 md:flex-row md:gap-10">
            {unauthorized ? (
              <PageMessage
                icon={LockKeyholeIcon}
                title="Open the link from the terminal"
                className="flex-1 justify-center"
              >
                This page needs the link mc-mod printed when it started (it ends in{' '}
                <code className="whitespace-nowrap">?t=…</code>). Each run makes a new one, so links
                from an earlier run stop working.
              </PageMessage>
            ) : instance.isError ? (
              <PageMessage
                icon={UnplugIcon}
                title="Couldn't load the instance"
                destructive
                className="flex-1 justify-center"
                action={
                  <Button
                    variant="outline"
                    onClick={() => void instance.refetch()}
                    disabled={instance.isFetching}
                  >
                    <RotateCwIcon className={instance.isFetching ? 'animate-spin' : undefined} />
                    Try again
                  </Button>
                }
              >
                {errorMessage(instance.error)}
              </PageMessage>
            ) : ready ? (
              <>
                <Prefetch />
                <AppNav contentKind={ready.contentKind} />
                <main className="flex min-w-0 flex-1 flex-col">
                  {/*
                   * React runs the view transition for us: react-router's location update is a
                   * React transition, and so is the split toggle, so every content swap animates
                   * the same way (see the `page` class in index.css). Keyed by path: moving to
                   * another page clears a crashed one.
                   */}
                  <ViewTransition default="page">
                    <ErrorBoundary key={pathname}>
                      <Routes>
                        {/* One LibraryView for all three, so moving between them keeps its state. */}
                        <Route element={<LibraryView contentKind={ready.contentKind} />}>
                          <Route index element={null} />
                          <Route path="browse" element={null} />
                          <Route path="project/:provider/:id" element={null} />
                        </Route>
                        <Route
                          path="export"
                          element={<ExportView plugins={ready.contentKind === 'plugin'} />}
                        />
                        <Route
                          path="share"
                          element={<ShareView contentKind={ready.contentKind} />}
                        />
                        <Route path="settings" element={<SettingsView />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </ErrorBoundary>
                  </ViewTransition>
                </main>
              </>
            ) : instance.isPending ? (
              <PageSkeleton />
            ) : null}
          </div>
        </ScrollPanel>
      </PageScrollContext>
      {instance.data && (
        <InstanceDialog data={instance.data} open={editing} onOpenChange={setEditing} />
      )}
    </div>
  )
}

/** The routes LibraryView serves; they manage the page scroll themselves. */
function inLibrary(pathname: string): boolean {
  return pathname === '/' || pathname === '/browse' || pathname.startsWith('/project/')
}

/**
 * Starts the requests every page needs as soon as the instance is known, whichever page is open, so
 * moving to Installed or Browse finds the list already there instead of scanning the folder on arrival.
 */
function Prefetch() {
  useMods()
  useSettings()
  return null
}

/** The navigation and a table's outline while the instance loads. */
function PageSkeleton() {
  return (
    <>
      <div className="flex shrink-0 gap-1 md:w-44 md:flex-col" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Skeleton key={i} className="h-9 w-24 rounded-lg md:w-full" />
        ))}
      </div>
      <div
        className="flex min-w-0 flex-1 flex-col gap-6"
        role="status"
        aria-busy
        aria-label="Loading"
      >
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    </>
  )
}

export default App
