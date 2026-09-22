import { useState } from 'react'
import { AppHeader } from '@/components/app-header'
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
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
        {unauthorized ? (
          <Badge variant="destructive">
            Not authorized. Open the link printed in the terminal.
          </Badge>
        ) : instance.data ? (
          <p className="text-muted-foreground text-sm break-all">
            {instance.data.instance.contentDir}
          </p>
        ) : null}
      </main>
      {instance.data && (
        <InstanceDialog data={instance.data} open={editing} onOpenChange={setEditing} />
      )}
    </div>
  )
}

export default App
