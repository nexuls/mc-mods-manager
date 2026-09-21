import { Badge } from '@/components/ui/badge'
import { useHealth } from '@/hooks/use-health'
import { ApiClientError } from '@/lib/api'

function App() {
  const health = useHealth()

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">mc-mod</h1>
      {health.isPending ? (
        <Badge variant="secondary">Connecting…</Badge>
      ) : health.isSuccess ? (
        <Badge variant="secondary">Connected · v{health.data.version}</Badge>
      ) : (
        <Badge variant="destructive">
          {health.error instanceof ApiClientError && health.error.code === 'UNAUTHORIZED'
            ? 'Not authorized. Open the link printed in the terminal.'
            : 'Server disconnected'}
        </Badge>
      )}
    </main>
  )
}

export default App
