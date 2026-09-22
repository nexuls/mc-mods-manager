import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A centered icon, title and text in a dashed box: empty results, errors and blocked pages. */
export function PageMessage({
  icon: Icon,
  title,
  children,
  action,
  destructive = false,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  destructive?: boolean
  className?: string
}) {
  return (
    <div
      role={destructive ? 'alert' : undefined}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center',
        className,
      )}
    >
      <Icon
        className={cn('size-10', destructive ? 'text-destructive' : 'text-muted-foreground')}
        aria-hidden
      />
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted-foreground max-w-md text-sm">{children}</div>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
