import { contentDirName } from '@mc-mod/shared'
import { useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { InstalledView } from '@/components/installed-view'
import { InstanceDialog } from '@/components/instance-dialog'
import { Badge } from '@/components/ui/badge'
import { useInstance } from '@/hooks/use-instance'
import { ApiClientError } from '@/lib/api'

function App() {
  const instance = useInstance()
  const [editing, setEditing] = useState(false)

  const unauthorized =
    instance.error instanceof ApiClientError && instance.error.code === 'UNAUTHORIZED'

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader onEditInstance={() => setEditing(true)} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
        {unauthorized ? (
          <div className="flex flex-1 items-center justify-center">
            <Badge variant="destructive">
              Not authorized. Open the link printed in the terminal.
            </Badge>
          </div>
        ) : instance.data && !instance.data.needsSetup ? (
          <InstalledView contentLabel={contentDirName[instance.data.instance.contentKind]} />
        ) : null}
      </main>
      {instance.data && (
        <InstanceDialog data={instance.data} open={editing} onOpenChange={setEditing} />
      )}
    </div>
  )
}

export default App
