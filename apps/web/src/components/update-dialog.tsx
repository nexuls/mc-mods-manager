import { contentDirName, type InstalledMod, providerLabel } from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ArrowUpCircleIcon,
  CheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { ProjectIcon } from '@/components/project-icon'
import { ScrollPanel } from '@/components/scroll-panel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { type ItemProgress, type Run, useUpdateJob } from '@/hooks/use-install'
import { useInstance } from '@/hooks/use-instance'
import { errorMessage } from '@/lib/api'
import { fileSize } from '@/lib/format'
import { displayName, displayVersion, primary } from '@/lib/mods'
import { cn } from '@/lib/utils'

/**
 * Confirms and runs updates found by "Check updates": one jar (its row, a Browse card, a project page) or
 * every jar with one. `mods` is a snapshot taken when it opened, so rows stay put while the list
 * refreshes. Files the author only allows downloading from the website get a Download link instead.
 */
export function UpdateDialog({
  mods,
  onOpenChange,
}: {
  mods: InstalledMod[] | null
  onOpenChange: (open: boolean) => void
}) {
  const open = mods !== null
  const { run, items, updateAll, reset } = useUpdateJob()
  const list = (mods ?? []).filter((m) => m.update)
  const auto = list.filter((m) => !m.update?.manual)
  const manual = list.filter((m) => m.update?.manual)
  const busy = run.state === 'running'
  const contentLabel = contentDirName[useInstance().data?.instance.contentKind ?? 'mod']

  // A new set of mods starts from scratch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens anew
  useEffect(() => reset(), [mods, reset])

  const progressOf = (m: InstalledMod): ItemProgress | undefined => {
    if (run.state !== 'running' && run.state !== 'finished') return undefined
    const i = items.findIndex((item) => item.fileName === m.fileName)
    return i === -1 ? undefined : run.items[i]
  }

  const start = async () => {
    const result = await updateAll(auto.map((m) => m.fileName))
    if (result.state === 'error') {
      toast.error(errorMessage(result.error))
    } else if (result.state === 'finished' && result.failed > 0) {
      toast.error(`${result.failed} of ${auto.length} failed to update`)
    } else if (result.state === 'finished') {
      const [one] = auto
      toast.success(
        auto.length === 1 && one
          ? `Updated ${displayName(one)} to ${one.update?.versionNumber}`
          : `Updated ${auto.length} files`,
      )
      if (manual.length === 0) onOpenChange(false)
    }
  }

  const [single] = list
  const size = auto.reduce((n, m) => n + (m.update?.size ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="*:min-w-0 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {list.length === 1 && single ? `Update ${displayName(single)}` : 'Update all'}
          </DialogTitle>
          <DialogDescription>
            {describe(auto.length, manual.length, contentLabel)}
          </DialogDescription>
        </DialogHeader>

        {list.length === 0 ? (
          <Alert>
            <AlertTriangleIcon />
            <AlertDescription>Nothing to update. Check for updates first.</AlertDescription>
          </Alert>
        ) : (
          <ScrollPanel className="-mx-2" viewportClassName="max-h-[50vh]">
            <ul className="flex flex-col gap-1 px-2">
              {list.map((m) => (
                <UpdateRow key={m.fileName} mod={m} progress={progressOf(m)} />
              ))}
            </ul>
          </ScrollPanel>
        )}

        <DialogFooter className="items-center">
          {size > 0 && run.state === 'idle' && (
            <span className="text-muted-foreground mr-auto text-xs">
              {fileSize(size)} to download
            </span>
          )}
          {isOver(run) ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={busy || auto.length === 0} onClick={() => void start()}>
                <ArrowUpCircleIcon />
                {busy ? 'Updating…' : auto.length > 1 ? `Update ${auto.length}` : 'Update'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function isOver(run: Run): boolean {
  return run.state === 'finished' || run.state === 'error'
}

function describe(auto: number, manual: number, contentLabel: string): string {
  const parts: string[] = []
  if (auto > 0) {
    parts.push(
      `${auto === 1 ? 'The new version is' : `${auto} new versions are`} downloaded and checked first; the old ${auto === 1 ? 'file goes' : 'files go'} to .mc-mod/trash.`,
    )
  }
  if (manual > 0) {
    parts.push(
      `${manual === 1 ? 'One file has' : `${manual} files have`} to be downloaded from the website: put ${manual === 1 ? 'it' : 'them'} in the ${contentLabel} folder and remove the old ${manual === 1 ? 'one' : 'ones'}.`,
    )
  }
  return parts.join(' ')
}

function UpdateRow({ mod, progress }: { mod: InstalledMod; progress: ItemProgress | undefined }) {
  const { update } = mod
  if (!update) return null
  const from = displayVersion(mod)
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border p-2.5',
        update.manual && 'bg-muted/40',
      )}
    >
      <ProjectIcon url={primary(mod)?.iconUrl} className="size-10" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{displayName(mod)}</span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
          {from && (
            <>
              <span className="truncate">{from}</span>
              <ArrowRightIcon className="size-3 shrink-0" />
            </>
          )}
          <span className="text-foreground truncate">{update.versionNumber}</span>
          {!update.manual && <span className="shrink-0">· {fileSize(update.size)}</span>}
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
      </div>
      {progress?.state === 'done' ? (
        <CheckIcon className="size-4 text-emerald-500" aria-label="Updated" />
      ) : progress?.state === 'failed' ? (
        <CircleXIcon className="text-destructive size-4" aria-label="Failed" />
      ) : update.manual && update.pageUrl ? (
        <Button variant="outline" size="sm" asChild>
          <a href={update.pageUrl} target="_blank" rel="noreferrer noopener">
            Download
            <ExternalLinkIcon />
          </a>
        </Button>
      ) : update.manual ? (
        <span className="text-muted-foreground text-xs">
          On {providerLabel[update.provider]} only
        </span>
      ) : null}
    </li>
  )
}
