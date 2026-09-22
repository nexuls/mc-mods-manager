import { type InstalledMod, providerLabel, type RankedVersion } from '@mc-mod/shared'
import { AlertTriangleIcon, ExternalLinkIcon, RepeatIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useVersions } from '@/hooks/use-catalog'
import { useUpdateJob } from '@/hooks/use-install'
import { errorMessage } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { displayName, displayVersion, primary } from '@/lib/mods'

/**
 * Switches an identified jar to another version of its project, newer or older. Lists the versions for
 * the instance, or all of them with the switch on. Mount it only while open (it fetches on mount).
 */
export function ChangeVersionDialog({
  mod,
  onOpenChange,
}: {
  mod: InstalledMod
  onOpenChange: (open: boolean) => void
}) {
  const source = primary(mod)
  const [all, setAll] = useState(false)
  const versions = useVersions(source?.provider ?? 'modrinth', source?.projectId ?? '', all)
  const { run, changeVersion } = useUpdateJob()
  const [picked, setPicked] = useState<string | undefined>(mod.update?.versionId)
  const name = displayName(mod)

  const isInstalled = (v: RankedVersion) =>
    v.id === source?.versionId || v.file?.sha1?.toLowerCase() === mod.sha1
  const list = versions.data?.versions.filter((v) => v.file) ?? []
  const selected = list.find((v) => v.id === picked)
  const busy = run.state === 'running'
  const progress = run.state === 'running' ? run.items[0] : undefined

  const start = async () => {
    if (!selected) return
    const result = await changeVersion(mod.fileName, selected.id)
    if (result.state === 'error') {
      toast.error(errorMessage(result.error))
    } else if (result.state === 'finished') {
      const [item] = result.items
      if (item?.state === 'failed') {
        toast.error(item.message)
      } else {
        toast.success(`${name} is now on ${selected.versionNumber}`)
        onOpenChange(false)
      }
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="*:min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change version of {name}</DialogTitle>
          <DialogDescription>
            {displayVersion(mod) ? `Installed: ${displayVersion(mod)}. ` : ''}The other version is
            downloaded and checked first; the current file goes to .mc-mod/trash.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2">
          <Switch id="change-all-versions" checked={all} onCheckedChange={setAll} />
          <Label htmlFor="change-all-versions">Show all versions</Label>
        </div>

        {!source ? null : versions.isPending ? (
          <Skeleton className="h-9" />
        ) : versions.isError ? (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>{errorMessage(versions.error)}</AlertDescription>
          </Alert>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No versions for this instance. Turn on “Show all versions” to see the rest.
          </p>
        ) : (
          <Select value={picked} onValueChange={setPicked} disabled={busy}>
            <SelectTrigger className="w-full" aria-label="Version">
              <SelectValue placeholder="Pick a version" />
            </SelectTrigger>
            <SelectContent>
              {list.map((v) => (
                <SelectItem key={v.id} value={v.id} disabled={isInstalled(v)}>
                  <span className="truncate">{v.versionNumber}</span>
                  <span className="text-muted-foreground text-xs">{shortDate(v.publishedAt)}</span>
                  {isInstalled(v) && <Badge variant="secondary">Installed</Badge>}
                  {v.recommended && !isInstalled(v) && (
                    <Badge variant="secondary">Recommended</Badge>
                  )}
                  {v.type !== 'release' && <Badge variant="outline">{v.type}</Badge>}
                  {!v.compatible && <Badge variant="outline">Doesn't fit</Badge>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selected && !selected.compatible && (
          <Alert>
            <AlertTriangleIcon />
            <AlertDescription>
              {selected.versionNumber} isn't made for this instance's loader and game version.
            </AlertDescription>
          </Alert>
        )}
        {progress?.state === 'downloading' && (
          <Progress value={progress.total > 0 ? (progress.received / progress.total) * 100 : 50} />
        )}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {selected && !selected.file?.url && source ? (
            <Button asChild>
              <a href={selected.pageUrl} target="_blank" rel="noreferrer noopener">
                Download from {providerLabel[source.provider]}
                <ExternalLinkIcon />
              </a>
            </Button>
          ) : (
            <Button disabled={!selected || busy} onClick={() => void start()}>
              <RepeatIcon />
              {busy ? 'Switching…' : 'Switch version'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
