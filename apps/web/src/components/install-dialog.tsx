import { contentDirName, type PlanBody, type PlanItem, providerLabel } from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleXIcon,
  DownloadIcon,
  ExternalLinkIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { type ItemProgress, useInstallJob, useInstallPlan } from '@/hooks/use-install'
import { useInstance } from '@/hooks/use-instance'
import { errorMessage } from '@/lib/api'
import { fileSize } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface InstallTarget extends PlanBody {
  title: string
}

const roleLabel: Record<PlanItem['role'], string> = {
  main: 'Selected',
  required: 'Required',
  optional: 'Optional',
}

/**
 * Plan → confirm → install. Shows the project with its dependencies (required ones locked in, optional
 * ones unticked, installed ones greyed out), then follows the install job item by item.
 */
export function InstallDialog({
  target,
  onOpenChange,
}: {
  target: InstallTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const open = target !== null
  const body: PlanBody = {
    provider: target?.provider ?? 'modrinth',
    projectId: target?.projectId ?? '',
    versionId: target?.versionId,
  }
  const plan = useInstallPlan(body, open)
  const { run, start, reset } = useInstallJob()
  const [optional, setOptional] = useState<ReadonlySet<string>>(new Set())

  // A new target starts from scratch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the target changes
  useEffect(() => {
    reset()
    setOptional(new Set())
  }, [target?.projectId, target?.versionId, reset])

  const items = plan.data?.items ?? []
  const chosen = items.filter(
    (i) => i.status === 'install' && (i.role !== 'optional' || optional.has(i.projectId)),
  )
  const main = items[0]
  const busy = run.state === 'running'
  const started = run.state !== 'idle'

  // The job's item-* events index into the project ids sent when it started.
  const [jobItems, setJobItems] = useState<string[]>([])
  const progressOf = (item: PlanItem): ItemProgress | undefined => {
    if (run.state !== 'running' && run.state !== 'finished') return undefined
    const i = jobItems.indexOf(item.projectId)
    return i === -1 ? undefined : run.items[i]
  }

  const install = async () => {
    const list = chosen.flatMap((i) =>
      i.versionId ? [{ provider: i.provider, projectId: i.projectId, versionId: i.versionId }] : [],
    )
    setJobItems(list.map((i) => i.projectId))
    const result = await start({ items: list })
    if (result.state === 'error') {
      toast.error(errorMessage(result.error))
    } else if (result.state === 'finished' && result.failed > 0) {
      toast.error(`${result.failed} of ${list.length} failed to install`)
    } else if (result.state === 'finished') {
      toast.success(
        list.length === 1 ? `Installed ${target?.title}` : `Installed ${list.length} files`,
      )
      onOpenChange(false)
    }
  }

  const toggle = (id: string, on: boolean) =>
    setOptional((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const instance = useInstance().data?.instance
  const contentLabel = instance ? contentDirName[instance.contentKind] : 'mods'
  const deps = chosen.length - (main?.status === 'install' ? 1 : 0)
  const totalSize = chosen.reduce((n, i) => n + (i.size ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="*:min-w-0 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Install {target?.title}</DialogTitle>
          <DialogDescription>
            {plan.isPending
              ? 'Looking up versions and dependencies…'
              : main?.status === 'installed'
                ? 'This project is already installed.'
                : main?.status === 'manual'
                  ? `Its author only allows downloading it from the ${providerLabel[main.provider]} website: download it there and put it in the ${contentLabel} folder, and mc-mod will pick it up.${deps > 0 ? ` ${deps} ${deps === 1 ? 'dependency' : 'dependencies'} can still be installed here.` : ''}`
                  : main?.status === 'unavailable'
                    ? "There's no version of it for this instance."
                    : deps > 0
                      ? `${target?.title} and ${deps} ${deps === 1 ? 'dependency' : 'dependencies'} will be downloaded.`
                      : `${target?.title} will be downloaded.`}
          </DialogDescription>
        </DialogHeader>

        {plan.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : plan.isError ? (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>{errorMessage(plan.error)}</AlertDescription>
          </Alert>
        ) : (
          <>
            {plan.data.warnings.length > 0 && (
              <Alert>
                <AlertTriangleIcon />
                <AlertDescription>
                  <ul className="flex flex-col gap-1">
                    {plan.data.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <ScrollPanel className="-mx-2" viewportClassName="max-h-[50vh]">
              <ul className="flex flex-col gap-1 px-2">
                {items.map((item) => (
                  <PlanRow
                    key={item.projectId}
                    item={item}
                    checked={chosen.includes(item)}
                    locked={started || item.status !== 'install' || item.role !== 'optional'}
                    onCheckedChange={(on) => toggle(item.projectId, on)}
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
                {busy ? 'Installing…' : chosen.length > 1 ? `Install ${chosen.length}` : 'Install'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanRow({
  item,
  checked,
  locked,
  onCheckedChange,
  progress,
}: {
  item: PlanItem
  checked: boolean
  locked: boolean
  onCheckedChange: (checked: boolean) => void
  progress: ItemProgress | undefined
}) {
  const id = `plan-${item.projectId}`
  const inactive = item.status !== 'install'
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
          <Badge variant={item.role === 'main' ? 'default' : 'secondary'}>
            {roleLabel[item.role]}
          </Badge>
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {item.status === 'install'
            ? [
                item.versionNumber,
                item.note,
                item.requiredBy.length > 0 && `for ${item.requiredBy.join(', ')}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : item.reason}
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
      ) : item.status === 'installed' ? (
        <Badge variant="outline">Installed</Badge>
      ) : item.status === 'manual' && item.pageUrl ? (
        <Button variant="outline" size="sm" asChild>
          <a href={item.pageUrl} target="_blank" rel="noreferrer noopener">
            Download
            <ExternalLinkIcon />
          </a>
        </Button>
      ) : item.status === 'unavailable' ? (
        <Badge variant="outline" className="text-destructive">
          Unavailable
        </Badge>
      ) : item.side !== 'unknown' || item.provider === 'modrinth' ? (
        // CurseForge has no side information, so its "unknown" says nothing.
        <SideChip side={item.side} />
      ) : null}
    </li>
  )
}
