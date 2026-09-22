import { SettingsIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useHealth } from '@/hooks/use-health'
import { useInstance } from '@/hooks/use-instance'
import { describeInstance } from '@/lib/instance'

export function AppHeader({ onEditInstance }: { onEditInstance: () => void }) {
  const instance = useInstance()
  const health = useHealth()

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      <span className="font-semibold">mc-mod</span>
      {instance.data ? (
        <Button variant="outline" size="sm" onClick={onEditInstance}>
          {describeInstance(instance.data.instance)}
          <SettingsIcon />
        </Button>
      ) : (
        <Skeleton className="h-8 w-56" />
      )}
      <div className="ml-auto">
        {health.isError && <Badge variant="destructive">Server disconnected</Badge>}
      </div>
    </header>
  )
}
