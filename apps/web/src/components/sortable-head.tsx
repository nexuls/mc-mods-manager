import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { TableHead } from '@/components/ui/table'
import type { ModSort, SortKey } from '@/lib/mods'
import { cn } from '@/lib/utils'

/** A column header that sorts the table by `column`; clicking again flips the direction. */
export function SortableHead({
  column,
  sort,
  onSort,
  children,
  className,
}: {
  column: SortKey
  sort: ModSort
  onSort: (column: SortKey) => void
  children: ReactNode
  className?: string
}) {
  const active = sort.key === column
  const Icon = !active ? ArrowUpDownIcon : sort.desc ? ArrowDownIcon : ArrowUpIcon

  return (
    <TableHead
      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
      className={className}
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5 text-sm font-medium"
        onClick={() => onSort(column)}
      >
        {children}
        <Icon className={cn(!active && 'text-muted-foreground opacity-60')} />
      </Button>
    </TableHead>
  )
}
