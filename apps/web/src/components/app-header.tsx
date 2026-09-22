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
    <header className="bg-background shrink-0 border-b">
      <div className="mx-auto flex h-16 w-full max-w-[120rem] items-center gap-3 px-6 sm:gap-4">
        <span className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <BlocksIcon className="size-4" />
          </span>
          {/* Phones keep the room for the instance button; the logo still names the app. */}
          <span className="max-sm:sr-only">mc-mod</span>
        </span>
        {instance.data ? (
          <Button variant="outline" onClick={onEditInstance} className="min-w-0">
            <span className="truncate">{describeInstance(instance.data.instance)}</span>
            <PencilIcon />
          </Button>
        ) : instance.isPending ? (
          <Skeleton className="h-8 w-56 max-sm:w-32" />
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ServerStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
