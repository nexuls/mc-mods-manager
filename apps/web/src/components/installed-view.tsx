import type { InstalledMod } from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  ArrowUpCircleIcon,
  CompassIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  SearchCheckIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ChangeVersionDialog } from '@/components/change-version-dialog'
import { LinkDialog } from '@/components/link-dialog'
import { ModRow } from '@/components/mod-row'
import { PageMessage } from '@/components/page-message'
import { ScrollPanel } from '@/components/scroll-panel'
import { SortableHead } from '@/components/sortable-head'
import { TrashDialog } from '@/components/trash-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { UpdateDialog } from '@/components/update-dialog'
import { useCheckUpdates, useMods, useRefreshMods } from '@/hooks/use-mods'
import { useSplitView } from '@/hooks/use-split-view'
import { useTrash } from '@/hooks/use-trash'
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
import { cn } from '@/lib/utils'

/** The installed list; `text` comes from the shared search bar. */
export function InstalledView({ contentLabel, text }: { contentLabel: string; text: string }) {
  const mods = useMods()
  const refresh = useRefreshMods()
  const check = useCheckUpdates()
  const [filter, setFilter] = useState<ModFilter>('all')
  const [sort, setSort] = useState<ModSort>(defaultSort)
  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))
  // The mod whose link dialog is open, by file name (the row may re-render with new data).
  const [linking, setLinking] = useState<string | null>(null)
  // A snapshot, so the dialog's rows stay while the list refreshes under it.
  const [updating, setUpdating] = useState<InstalledMod[] | null>(null)
  const [changing, setChanging] = useState<string | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const trashCount = useTrash().data?.items.length ?? 0

  const all = mods.data?.mods ?? []
  const shown = filterMods(all, filter, text, sort)
  const counts = countByFilter(all)
  const linkingMod: InstalledMod | undefined = all.find((m) => m.fileName === linking)
  const changingMod = all.find((m) => m.fileName === changing)
  const withUpdates = all.filter((m) => m.update)

  const { split } = useSplitView()
  const card = 'bg-card min-h-0 rounded-xl border **:data-[slot=table-container]:overflow-x-clip'
  const table = (
    <>
      <Table className="[&_td]:py-3 [&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4">
        {/* Opaque cells (muted/40 over the card) and a shadow for the line: a collapsed border stays behind. */}
        <TableHeader className="sticky top-0 z-10 [&_th]:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] [&_th]:shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0">
          <TableRow>
            <TableHead />
            <SortableHead column="name" sort={sort} onSort={onSort}>
              Name
            </SortableHead>
            <TableHead className="@max-3xl:hidden">Version</TableHead>
            <SortableHead column="source" sort={sort} onSort={onSort}>
              Source
            </SortableHead>
            <SortableHead column="side" sort={sort} onSort={onSort} className="@max-2xl:hidden">
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
            <ModRow
              key={m.fileName}
              mod={m}
              onLink={() => setLinking(m.fileName)}
              onUpdate={() => setUpdating([m])}
              onChangeVersion={() => setChanging(m.fileName)}
            />
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
    </>
  )

  return (
    // Split view: the table scrolls on its own below the title and filters.
    <div className="split:h-full split:min-h-0 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Installed {contentLabel}</h1>
          <p className="text-muted-foreground text-sm">
            {mods.data
              ? `${all.length} ${all.length === 1 ? 'file' : 'files'} in the ${contentLabel} folder`
              : `Everything in the ${contentLabel} folder`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTrashOpen(true)}>
            <Trash2Icon />
            Trash
            {trashCount > 0 && (
              <span className="text-muted-foreground tabular-nums">{trashCount}</span>
            )}
          </Button>
          <Button
            variant="outline"
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
          <Button
            variant="outline"
            disabled={check.isPending || mods.isPending}
            onClick={() =>
              check.mutate(undefined, {
                onSuccess: (r) => {
                  const n = r.mods.filter((m) => m.update).length
                  if (n > 0) {
                    toast.success(n === 1 ? '1 update available' : `${n} updates available`)
                    setFilter('updates')
                  } else toast.success('Everything is up to date')
                },
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            <SearchCheckIcon className={check.isPending ? 'animate-pulse' : undefined} />
            {check.isPending ? 'Checking…' : 'Check updates'}
          </Button>
          {withUpdates.length > 0 && (
            <Button onClick={() => setUpdating(withUpdates)}>
              <ArrowUpCircleIcon />
              Update all
              <span className="tabular-nums opacity-80">{withUpdates.length}</span>
            </Button>
          )}
        </div>
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
        <PageMessage
          icon={AlertTriangleIcon}
          title={`Couldn't read your ${contentLabel}`}
          destructive
          action={
            <Button
              variant="outline"
              onClick={() => void mods.refetch()}
              disabled={mods.isFetching}
            >
              <RefreshCwIcon className={mods.isFetching ? 'animate-spin' : undefined} />
              Try again
            </Button>
          }
        >
          {errorMessage(mods.error)}
        </PageMessage>
      ) : all.length === 0 ? (
        <PageMessage
          icon={PackageOpenIcon}
          title={`No ${contentLabel} yet`}
          action={
            <Button asChild>
              <Link to="/browse">
                <CompassIcon />
                Browse
              </Link>
            </Button>
          }
        >
          Find some on Modrinth, or add jars to the folder and they show up here.
        </PageMessage>
      ) : // The table's own wrapper is `overflow-clip`, not hidden/auto, so the header can stick: to the page, or to
      // this card where it scrolls on its own (split view). Below the split the card mustn't scroll or clip
      // either, or the header would stick to it instead of the page.
      split ? (
        <ScrollPanel className={card} topShadowClassName="top-10">
          {table}
        </ScrollPanel>
      ) : (
        <div className={cn(card, 'overflow-clip')}>{table}</div>
      )}

      {linkingMod && (
        <LinkDialog mod={linkingMod} open onOpenChange={(o) => !o && setLinking(null)} />
      )}
      {changingMod && (
        <ChangeVersionDialog mod={changingMod} onOpenChange={(o) => !o && setChanging(null)} />
      )}
      <UpdateDialog mods={updating} onOpenChange={(o) => !o && setUpdating(null)} />
      <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} contentLabel={contentLabel} />
    </div>
  )
}
