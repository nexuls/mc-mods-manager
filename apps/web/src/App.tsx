import { useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AppHeader } from '@/components/app-header'
import { AppNav } from '@/components/app-nav'
import { ExportView } from '@/components/export-view'
import { InstanceDialog } from '@/components/instance-dialog'
import { LibraryView } from '@/components/library-view'
import { ScrollPanel } from '@/components/scroll-panel'
import { SettingsView } from '@/components/settings-view'
import { Badge } from '@/components/ui/badge'
import { useInstance } from '@/hooks/use-instance'
import { PageScrollContext } from '@/hooks/use-page-scroll'
import { ApiClientError } from '@/lib/api'

function App() {
  const instance = useInstance()
  const [editing, setEditing] = useState(false)
  const page = useRef<HTMLDivElement>(null)

  const unauthorized =
    instance.error instanceof ApiClientError && instance.error.code === 'UNAUTHORIZED'
  const ready = instance.data && !instance.data.needsSetup ? instance.data.instance : null

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
              <div className="flex flex-1 items-center justify-center">
                <Badge variant="destructive">
                  Not authorized. Open the link printed in the terminal.
                </Badge>
              </div>
            ) : ready ? (
              <>
                <AppNav contentKind={ready.contentKind} />
                <main className="flex min-w-0 flex-1 flex-col">
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
                    <Route path="settings" element={<SettingsView />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </>
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

export default App
