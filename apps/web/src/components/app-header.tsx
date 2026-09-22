import { BlocksIcon, PencilIcon } from 'lucide-react'
import { ServerStatus } from '@/components/server-status'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useInstance } from '@/hooks/use-instance'
import { describeInstance } from '@/lib/instance'

export function AppHeader({ onEditInstance }: { onEditInstance: () => void }) {
  const instance = useInstance()

  return (
    <header className="bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-(--breakpoint-2xl) items-center gap-4 px-6">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <BlocksIcon className="size-4" />
          </span>
          mc-mod
        </span>
        {instance.data ? (
          <Button variant="outline" onClick={onEditInstance} className="min-w-0">
            <span className="truncate">{describeInstance(instance.data.instance)}</span>
            <PencilIcon />
          </Button>
        ) : (
          <Skeleton className="h-8 w-56" />
        )}
        <div className="ml-auto flex items-center gap-2">
          <ServerStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
