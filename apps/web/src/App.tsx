import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AppHeader } from '@/components/app-header'
import { AppNav } from '@/components/app-nav'
import { InstanceDialog } from '@/components/instance-dialog'
import { LibraryView } from '@/components/library-view'
import { ProjectView } from '@/components/project-view'
import { SettingsView } from '@/components/settings-view'
import { Badge } from '@/components/ui/badge'
import { useInstance } from '@/hooks/use-instance'
import { ApiClientError } from '@/lib/api'

function App() {
  const instance = useInstance()
  const [editing, setEditing] = useState(false)

  const unauthorized =
    instance.error instanceof ApiClientError && instance.error.code === 'UNAUTHORIZED'
  const ready = instance.data && !instance.data.needsSetup ? instance.data.instance : null

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader onEditInstance={() => setEditing(true)} />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 md:flex-row md:gap-10">
        {unauthorized ? (
          <div className="flex flex-1 items-center justify-center">
            <Badge variant="destructive">
              Not authorized. Open the link printed in the terminal.
            </Badge>
          </div>
        ) : ready ? (
          <>
            <AppNav />
            <main className="flex min-w-0 flex-1 flex-col">
              <Routes>
                <Route
                  index
                  element={<LibraryView contentKind={ready.contentKind} pane="installed" />}
                />
                <Route
                  path="browse"
                  element={<LibraryView contentKind={ready.contentKind} pane="browse" />}
                />
                <Route path="project/:provider/:id" element={<ProjectView />} />
                <Route path="settings" element={<SettingsView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </>
        ) : null}
      </div>
      {instance.data && (
        <InstanceDialog data={instance.data} open={editing} onOpenChange={setEditing} />
      )}
    </div>
  )
}

export default App
