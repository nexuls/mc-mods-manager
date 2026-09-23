import type { ImportItem, ImportPlan, ImportStatus } from '@mc-mod/shared'
import {
  AlertTriangleIcon,
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
import { Progress } from '@/components/ui/progress'
import { type ItemProgress, useInstallJob } from '@/hooks/use-install'
import { errorMessage } from '@/lib/api'
import { fileSize, plural, shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Installable first, then the ones that need a hand, then what's already here. */
const statusOrder: Record<ImportStatus, number> = {
  install: 0,
  manual: 1,
  unavailable: 2,
  local: 3,
  installed: 4,
}

const statusLabel: Record<ImportStatus, string> = {
  install: 'Install',
  manual: 'Manual download',
  unavailable: 'Unavailable',
  local: 'Local file',
  installed: 'Installed',
}

/**
 * A shared mod list, checked against this instance: what it was made for, what would be installed
 * (ticked), and what's already here or can't be installed (locked). Installing runs the normal job.
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

  // A newly opened list starts from scratch: everything installable ticked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when another list is opened
  useEffect(() => {
    reset()
    setSkipped(new Set())
  }, [plan, reset])

  const items = useMemo(
    () =>
      plan ? [...plan.items].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]) : [],
    [plan],
  )
  const chosen = items.filter((i) => i.status === 'install' && !skipped.has(i.fileName))
  const busy = run.state === 'running'
  const started = run.state !== 'idle'
  const totalSize = chosen.reduce((n, i) => n + (i.size ?? 0), 0)
  const already = items.filter((i) => i.status === 'installed').length

  // The job's item-* events index into the files sent when it started.
  const [jobItems, setJobItems] = useState<string[]>([])
  const progressOf = (item: ImportItem): ItemProgress | undefined => {
    if (run.state !== 'running' && run.state !== 'finished') return undefined
    const i = jobItems.indexOf(item.fileName)
    return i === -1 ? undefined : run.items[i]
  }

  const install = async () => {
    const list = chosen.flatMap((i) =>
      i.provider && i.projectId && i.versionId
        ? [{ provider: i.provider, projectId: i.projectId, versionId: i.versionId }]
        : [],
    )
    setJobItems(chosen.map((i) => i.fileName))
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
            <ScrollPanel className="-mx-2" viewportClassName="max-h-[45vh]">
              <ul className="flex flex-col gap-1 px-2">
                {items.map((item) => (
                  <ImportRow
                    key={item.fileName}
                    item={item}
                    checked={chosen.includes(item)}
                    locked={started || item.status !== 'install'}
                    onCheckedChange={(on) => toggle(item.fileName, on)}
                    progress={progressOf(item)}
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

function ImportRow({
  item,
  checked,
  locked,
  onCheckedChange,
  progress,
}: {
  item: ImportItem
  checked: boolean
  locked: boolean
  onCheckedChange: (checked: boolean) => void
  progress: ItemProgress | undefined
}) {
  const id = `import-${item.fileName}`
  const inactive = item.status !== 'install'
  const version = item.versionNumber ?? item.listedVersion
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border p-2.5',
        inactive && 'text-muted-foreground bg-muted/40',
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
          {!item.enabled && <Badge variant="outline">Disabled there</Badge>}
        </span>
        <span className="text-muted-foreground truncate text-xs" title={item.note ?? item.reason}>
          {item.note ?? item.reason ?? item.fileName}
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
      ) : item.status === 'manual' && item.pageUrl ? (
        <Button variant="outline" size="sm" asChild>
          <a href={item.pageUrl} target="_blank" rel="noreferrer noopener">
            Download
            <ExternalLinkIcon />
          </a>
        </Button>
      ) : item.status !== 'install' ? (
        <Badge
          variant="outline"
          className={cn(item.status === 'unavailable' && 'text-destructive')}
        >
          {statusLabel[item.status]}
        </Badge>
      ) : (
        <SideChip side={item.side} />
      )}
    </li>
  )
}
