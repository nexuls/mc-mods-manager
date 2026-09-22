import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type ServerStatus as Status, serverStatus, useHealth } from '@/hooks/use-health'
import { cn } from '@/lib/utils'

const statusInfo: Record<Status, { label: string; dot: string }> = {
  checking: { label: 'Connecting', dot: 'bg-muted-foreground animate-pulse' },
  connected: { label: 'Connected', dot: 'bg-emerald-500' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-amber-500 animate-pulse' },
  disconnected: { label: 'Disconnected', dot: 'bg-destructive' },
}

/** Header badge showing whether the local mc-mod server answers `/api/health`. */
export function ServerStatus() {
  const health = useHealth()
  const status = serverStatus(health)
  const { label, dot } = statusInfo[status]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={status === 'disconnected' ? 'destructive' : 'outline'}
          className="h-6 gap-1.5 px-2.5"
          role="status"
          tabIndex={0}
        >
          <span className={cn('size-2 rounded-full', dot)} aria-hidden />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {status === 'disconnected'
          ? 'The mc-mod server stopped answering. Check the terminal it runs in, then reopen the link.'
          : health.data
            ? `mc-mod v${health.data.version}, last checked ${new Date(health.dataUpdatedAt).toLocaleTimeString()}`
            : 'Contacting the mc-mod server…'}
      </TooltipContent>
    </Tooltip>
  )
}
