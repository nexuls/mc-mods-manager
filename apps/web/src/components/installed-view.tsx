import type { InstalledMod } from '@mc-mod/shared'
import { AlertTriangleIcon, CompassIcon, PackageOpenIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { LinkDialog } from '@/components/link-dialog'
import { ModRow } from '@/components/mod-row'
import { SortableHead } from '@/components/sortable-head'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useMods, useRefreshMods } from '@/hooks/use-mods'
import { errorMessage } from '@/lib/api'
import {
  countByFilter,
  defaultSort,
  filterLabel,
  filterMods,
  ModFilter,
  type ModSort,
  type SortKey,
  toggleSort,
} from '@/lib/mods'

/** The installed list; `text` comes from the shared search bar. */
export function InstalledView({ contentLabel, text }: { contentLabel: string; text: string }) {
  const mods = useMods()
  const refresh = useRefreshMods()
  const [filter, setFilter] = useState<ModFilter>('all')
  const [sort, setSort] = useState<ModSort>(defaultSort)
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))
  // The mod whose link dialog is open, by file name (the row may re-render with new data).
  const [linking, setLinking] = useState<string | null>(null)

  const all = mods.data?.mods ?? []
  const shown = filterMods(all, filter, text, sort)
  const counts = countByFilter(all)
  const linkingMod: InstalledMod | undefined = all.find((m) => m.fileName === linking)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Installed {contentLabel}</h1>
        <p className="text-muted-foreground text-sm">
          {mods.data
            ? `${all.length} ${all.length === 1 ? 'file' : 'files'} in the ${contentLabel} folder`
            : `Everything in the ${contentLabel} folder`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filter}
          onValueChange={(v) => setFilter(ModFilter.find((f) => f === v) ?? 'all')}
          className="flex-wrap"
        >
          {ModFilter.map((f) => (
            <ToggleGroupItem key={f} value={f} disabled={f !== 'all' && counts[f] === 0}>
              {filterLabel[f]}
              <span className="text-muted-foreground tabular-nums">{counts[f]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={refresh.isPending || mods.isPending}
          onClick={() =>
            refresh.mutate(undefined, {
              onSuccess: (r) => toast.success(`Checked ${r.mods.length} files`),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        >
          <RefreshCwIcon className={refresh.isPending ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      </div>

      {mods.data?.warnings.map((w) => (
        <Alert key={w}>
          <AlertTriangleIcon />
          <AlertDescription>{w}</AlertDescription>
        </Alert>
      ))}

      {mods.isPending ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Reading and identifying your {contentLabel}…
          </p>
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : mods.isError ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>{errorMessage(mods.error)}</AlertDescription>
        </Alert>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-20 text-center">
          <PackageOpenIcon className="text-muted-foreground size-10" />
          <p className="font-medium">No {contentLabel} yet</p>
          <p className="text-muted-foreground text-sm">
            Find some on Modrinth, or add jars to the folder and they show up here.
          </p>
          <Button asChild className="mt-2">
            <Link to="/browse">
              <CompassIcon />
              Browse
            </Link>
          </Button>
        </div>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table className="[&_td]:py-3 [&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead />
                <SortableHead column="name" sort={sort} onSort={onSort}>
                  Name
                </SortableHead>
                <TableHead>Version</TableHead>
                <SortableHead column="source" sort={sort} onSort={onSort}>
                  Source
                </SortableHead>
                <SortableHead column="side" sort={sort} onSort={onSort}>
                  Side
                </SortableHead>
                <SortableHead column="enabled" sort={sort} onSort={onSort}>
                  Enabled
                </SortableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((m) => (
                <ModRow key={m.fileName} mod={m} onLink={() => setLinking(m.fileName)} />
              ))}
            </TableBody>
          </Table>
          {shown.length === 0 && (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {text.trim()
                ? `No installed ${contentLabel} match “${text.trim()}”.`
                : 'Nothing matches this filter.'}
            </p>
          )}
        </div>
      )}

      {linkingMod && (
        <LinkDialog mod={linkingMod} open onOpenChange={(o) => !o && setLinking(null)} />
      )}
    </div>
  )
}
