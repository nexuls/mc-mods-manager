import {
  bridgeInfo,
  type ImportItem,
  type ImportPlan,
  type ImportVersionMode,
} from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  CableIcon,
  CheckIcon,
  CircleXIcon,
  DownloadIcon,
  ExternalLinkIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SideChip } from '@/components/mod-chips'
import { ProjectIcon } from '@/components/project-icon'
import { ScrollPanel } from '@/components/scroll-panel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type ItemProgress, useInstallJob } from '@/hooks/use-install'
import { errorMessage } from '@/lib/api'
import { fileSize, plural, shortDate } from '@/lib/format'
import { type ImportRow, importRows, statusLabel } from '@/lib/import'
import { cn } from '@/lib/utils'

/**
 * A shared mod list, checked against this instance: what it was made for, what would be installed
 * (ticked), and what's already here or can't be installed (locked). Installing runs the normal job.
 *
 * Two controls decide what an import actually takes. **Versions** defaults to the exact builds the
 * list pinned, so importing reproduces the setup the list came from instead of jumping everyone to
 * the newest release; updating is then a deliberate step in Installed. **Include what doesn't fit**
 * adds the files with no build for this instance, which can still be downloaded and may still work.
 */
export function ImportDialog({
  plan,
  fileName,
  onOpenChange,
}: {
  plan: ImportPlan | null
  /** The file the list was read from, shown in the description. */
  fileName: string | null
  onOpenChange: (open: boolean) => void
}) {
  const open = plan !== null
  const { run, start, reset } = useInstallJob()
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set())
  const [mode, setMode] = useState<ImportVersionMode>('shared')
  const [includeIncompatible, setIncludeIncompatible] = useState(false)

  // A newly opened list starts from scratch: everything installable ticked, shared versions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when another list is opened
  useEffect(() => {
    reset()
    setSkipped(new Set())
    setMode('shared')
    setIncludeIncompatible(false)
  }, [plan, reset])

  const rows = useMemo(
    () => (plan ? importRows(plan.items, mode, includeIncompatible) : []),
    [plan, mode, includeIncompatible],
  )
  const chosen = rows.filter((r) => r.selectable && !skipped.has(r.item.fileName))
  const busy = run.state === 'running'
  const started = run.state !== 'idle'
  const totalSize = chosen.reduce((n, r) => n + (r.candidate?.size ?? 0), 0)
  const already = rows.filter((r) => r.status === 'installed').length
  const stuck = rows.filter((r) => r.status === 'incompatible').length

  // The job's item-* events index into the files sent when it started.
  const [jobItems, setJobItems] = useState<string[]>([])
  const progressOf = (item: ImportItem): ItemProgress | undefined => {
    if (run.state !== 'running' && run.state !== 'finished') return undefined
    const i = jobItems.indexOf(item.fileName)
    return i === -1 ? undefined : run.items[i]
  }

  const install = async () => {
    const list = chosen.flatMap(({ item, candidate }) =>
      item.provider && item.projectId && candidate
        ? [{ provider: item.provider, projectId: item.projectId, versionId: candidate.versionId }]
        : [],
    )
    if (list.length === 0) return
    setJobItems(chosen.map((r) => r.item.fileName))
    const result = await start({ items: list })
    if (result.state === 'error') {
      toast.error(errorMessage(result.error))
    } else if (result.state === 'finished' && result.failed > 0) {
      toast.error(`${result.failed} of ${list.length} failed to install`)
    } else if (result.state === 'finished') {
      toast.success(`Installed ${plural(list.length, 'file')} from the list`)
      onOpenChange(false)
    }
  }

  const toggle = (fileName: string, on: boolean) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (on) next.delete(fileName)
      else next.add(fileName)
      return next
    })

  const setAll = (on: boolean) =>
    setSkipped(on ? new Set() : new Set(rows.map((r) => r.item.fileName)))

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="*:min-w-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import mod list</DialogTitle>
          <DialogDescription>
            {plan
              ? `${fileName ?? 'The list'} holds ${plural(plan.items.length, 'mod')}, shared on ${shortDate(plan.createdAt)} from mc-mod ${plan.generator.version}.${already > 0 ? ` ${already} of them ${already === 1 ? 'is' : 'are'} already installed here and left unticked.` : ''}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {plan && (
          <>
            <Checks plan={plan} />
            {plan.warnings.length > 0 && (
              <Alert>
                <AlertTriangleIcon />
                <AlertDescription>
                  <ul className="flex flex-col gap-1">
                    {plan.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs font-medium">Versions</span>
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={mode}
                  disabled={started}
                  onValueChange={(v) => v && setMode(v as ImportVersionMode)}
                >
                  <ToggleGroupItem value="shared" className="px-2.5 text-xs">
                    As shared
                  </ToggleGroupItem>
                  <ToggleGroupItem value="best" className="px-2.5 text-xs">
                    Newest that fits
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="import-include-incompatible"
                      checked={includeIncompatible}
                      disabled={started || stuck === 0}
                      onCheckedChange={setIncludeIncompatible}
                    />
                    <Label htmlFor="import-include-incompatible" className="text-xs font-medium">
                      Include what doesn't fit{stuck > 0 ? ` (${stuck})` : ''}
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Downloads the files with no build for this instance anyway. They may not load.
                </TooltipContent>
              </Tooltip>

              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={started} onClick={() => setAll(true)}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" disabled={started} onClick={() => setAll(false)}>
                  None
                </Button>
              </div>
            </div>

            <ScrollPanel className="-mx-2" viewportClassName="max-h-[45vh]">
              <ul className="flex flex-col gap-1 px-2">
                {rows.map((row) => (
                  <ImportRowItem
                    key={row.item.fileName}
                    row={row}
                    checked={chosen.includes(row)}
                    locked={started || !row.selectable}
                    onCheckedChange={(on) => toggle(row.item.fileName, on)}
                    progress={progressOf(row.item)}
                  />
                ))}
              </ul>
            </ScrollPanel>
          </>
        )}

        <DialogFooter className="items-center">
          {totalSize > 0 && !started && (
            <span className="text-muted-foreground mr-auto text-xs">
              {fileSize(totalSize)} to download
            </span>
          )}
          {run.state === 'finished' || run.state === 'error' ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={busy || chosen.length === 0} onClick={() => void install()}>
                <DownloadIcon />
                {busy ? 'Installing…' : `Install ${plural(chosen.length, 'mod')}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The list's instance next to this one, so a mismatch is visible before anything is installed. */
function Checks({ plan }: { plan: ImportPlan }) {
  return (
    <dl className="bg-muted/40 grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
      <span />
      <span className="text-muted-foreground text-xs font-medium">The list</span>
      <span className="text-muted-foreground text-xs font-medium">This instance</span>
      {plan.checks.map((c) => (
        <div key={c.label} className="contents">
          <dt className="text-muted-foreground">{c.label}</dt>
          <dd
            className={cn(
              'truncate',
              c.match === 'differs' && 'text-amber-600 dark:text-amber-500',
            )}
          >
            {c.theirs ?? 'unknown'}
          </dd>
          <dd className="truncate">{c.ours ?? 'unknown'}</dd>
        </div>
      ))}
    </dl>
  )
}

function ImportRowItem({
  row,
  checked,
  locked,
  onCheckedChange,
  progress,
}: {
  row: ImportRow
  checked: boolean
  locked: boolean
  onCheckedChange: (checked: boolean) => void
  progress: ItemProgress | undefined
}) {
  const { item, status, candidate, detail } = row
  const id = `import-${item.fileName}`
  const inactive = status !== 'install' && !row.selectable
  const version = candidate?.versionNumber ?? item.listedVersion
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border p-2.5',
        inactive && 'text-muted-foreground bg-muted/40',
        row.selectable && status === 'incompatible' && 'border-amber-500/40',
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={locked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-label={`Install ${item.title}`}
      />
      <ProjectIcon url={item.iconUrl} className={cn('size-10', inactive && 'opacity-60')} />
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{item.title}</span>
          {version && <span className="text-muted-foreground shrink-0 text-xs">{version}</span>}
          {candidate?.bridge && (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-700 dark:text-amber-300"
              title={bridgeInfo[candidate.bridge].caveat}
            >
              <CableIcon />
              {bridgeInfo[candidate.bridge].label}
            </Badge>
          )}
          {!item.enabled && <Badge variant="outline">Disabled there</Badge>}
        </span>
        <span className="text-muted-foreground truncate text-xs" title={detail}>
          {detail ?? item.fileName}
        </span>
        {progress?.state === 'downloading' && (
          <Progress
            className="mt-1"
            value={progress.total > 0 ? (progress.received / progress.total) * 100 : 50}
          />
        )}
        {progress?.state === 'failed' && (
          <span className="text-destructive text-xs">{progress.message}</span>
        )}
      </label>
      {progress?.state === 'done' ? (
        <CheckIcon className="size-4 text-emerald-500" aria-label="Installed" />
      ) : progress?.state === 'failed' ? (
        <CircleXIcon className="text-destructive size-4" aria-label="Failed" />
      ) : status === 'manual' && candidate?.pageUrl ? (
        <Button variant="outline" size="sm" asChild>
          <a href={candidate.pageUrl} target="_blank" rel="noreferrer noopener">
            Download
            <ExternalLinkIcon />
          </a>
        </Button>
      ) : status !== 'install' ? (
        <Badge
          variant="outline"
          className={cn(
            status === 'unavailable' && 'text-destructive',
            status === 'incompatible' && 'text-amber-600 dark:text-amber-500',
          )}
        >
          {statusLabel[status]}
        </Badge>
      ) : (
        <SideChip side={item.side} />
      )}
    </li>
  )
}
