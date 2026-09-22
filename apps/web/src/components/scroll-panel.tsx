import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type Edges = { top: boolean; bottom: boolean }

/**
 * A vertical scroll area with the shadcn scrollbar, and a soft shadow on each edge the content continues past
 * (none at rest on the top, none once scrolled to the end), so it reads as sliding under that edge.
 * It is shadcn's `ScrollArea` with a few more hooks, built on the same primitive rather than editing `ui/`:
 * - `viewportRef` for code that scrolls it (the viewport is the element that scrolls);
 * - `viewportClassName`, e.g. a `max-h-*` for a list that grows up to a limit;
 * - `topShadowClassName` to start the top shadow below a sticky header (`top-10`).
 * Radix lays the content out as a table, which lets wide children stretch it past the panel; here it is a block,
 * so `truncate` and `min-w-0` work inside. Radix also sets `position: relative` inline on the root, so position
 * the panel with a wrapper, not `absolute` on it.
 */
export function ScrollPanel({
  className,
  viewportClassName,
  viewportRef,
  topShadowClassName,
  children,
}: {
  className?: string
  viewportClassName?: string
  viewportRef?: RefObject<HTMLDivElement | null>
  topShadowClassName?: string
  children: ReactNode
}) {
  const viewport = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState<Edges>({ top: false, bottom: false })

  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const update = () => {
      // 1px of slack: zoomed pages scroll by fractions and may stop just short of the end.
      const top = el.scrollTop > 1
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
      setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    // The panel resizing, or its content growing or shrinking, moves the edges without a scroll.
    const resize = new ResizeObserver(update)
    resize.observe(el)
    if (el.firstElementChild) resize.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [])

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative overflow-hidden', className)}
    >
      <ScrollAreaPrimitive.Viewport
        ref={(el) => {
          viewport.current = el
          if (viewportRef) viewportRef.current = el
        }}
        data-slot="scroll-area-viewport"
        className={cn(
          'focus-visible:ring-ring/50 size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] [&>div]:block!',
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <EdgeShadow side="top" visible={edges.top} className={topShadowClassName} />
      <EdgeShadow side="bottom" visible={edges.bottom} />
      <ScrollBar className="z-30" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function EdgeShadow({
  side,
  visible,
  className,
}: {
  side: 'top' | 'bottom'
  visible: boolean
  className?: string
}) {
  return (
    <div
      aria-hidden
      data-slot="scroll-shadow"
      className={cn(
        // Above sticky headers inside the viewport (z-10), below the scrollbar.
        'from-scroll-shadow via-scroll-shadow/30 pointer-events-none absolute inset-x-0 z-20 h-5 to-transparent opacity-0 transition-opacity duration-200',
        side === 'top' ? 'top-0 bg-linear-to-b' : 'bottom-0 bg-linear-to-t',
        visible && 'opacity-100',
        className,
      )}
    />
  )
}
