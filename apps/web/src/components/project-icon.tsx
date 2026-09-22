import { PackageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A project's icon, or a package glyph when it has none. Size it with `className` (default size-12). */
export function ProjectIcon({ url, className }: { url?: string; className?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className={cn('bg-muted size-12 shrink-0 rounded-lg object-cover', className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-lg [&_svg]:size-1/2',
        className,
      )}
    >
      <PackageIcon />
    </div>
  )
}
