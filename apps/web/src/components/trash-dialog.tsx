import type { TrashItem } from '@mc-mod/shared'
import { AlertTriangleIcon, ArchiveRestoreIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageMessage } from '@/components/page-message'
import { ScrollPanel } from '@/components/scroll-panel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDeleteTrash, useEmptyTrash, useRestoreTrash, useTrash } from '@/hooks/use-trash'
import { errorMessage } from '@/lib/api'
import { fileSize, plural, timeAgo } from '@/lib/format'

/** `.mc-mod/trash`: jars that were removed or replaced by an update, to restore or delete for good. */
export function TrashDialog({
  open,
  onOpenChange,
  contentLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentLabel: string
}) {
  const trash = useTrash()
  const empty = useEmptyTrash()
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const items = trash.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="*:min-w-0 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Files you removed and old versions replaced by updates, kept in .mc-mod/trash in the
            instance folder. Restoring puts a file back in the {contentLabel} folder.
          </DialogDescription>
        </DialogHeader>

        {trash.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : trash.isError ? (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>{errorMessage(trash.error)}</AlertDescription>
          </Alert>
        ) : items.length === 0 ? (
          <PageMessage icon={Trash2Icon} title="The trash is empty" className="py-10" />
        ) : (
          <ScrollPanel className="-mx-2" viewportClassName="max-h-[50vh]">
            <ul className="flex flex-col gap-1 px-2">
              {items.map((item) => (
                <TrashRow key={item.id} item={item} />
              ))}
            </ul>
          </ScrollPanel>
        )}

        <DialogFooter className="items-center">
          {items.length > 0 && (
            <span className="text-muted-foreground mr-auto text-xs tabular-nums">
              {plural(items.length, 'file')} · {fileSize(trash.data?.totalSize ?? 0)}
            </span>
          )}
          <Button
            variant="outline"
            disabled={items.length === 0 || empty.isPending}
            onClick={() => setConfirmEmpty(true)}
          >
            <Trash2Icon />
            Empty trash
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>

        <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Empty the trash?</AlertDialogTitle>
              <AlertDialogDescription>
                {plural(items.length, 'file')} ({fileSize(trash.data?.totalSize ?? 0)}) will be
                deleted for good. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  empty.mutate(undefined, {
                    onSuccess: (r) =>
                      toast.success(
                        `Deleted ${plural(r.removed, 'file')}, ${fileSize(r.freedBytes)} freed`,
                      ),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                Delete for good
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

function TrashRow({ item }: { item: TrashItem }) {
  const restore = useRestoreTrash()
  const remove = useDeleteTrash()
  const busy = restore.isPending || remove.isPending
  const disabled = item.fileName.endsWith('.disabled')

  return (
    <li className="flex items-center gap-3 rounded-lg border p-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium" title={item.fileName}>
          {item.fileName.replace(/\.disabled$/, '')}
        </span>
        <span className="text-muted-foreground text-xs">
          {timeAgo(item.trashedAt, Date.now(), true)} · {fileSize(item.size)}
          {disabled && ' · disabled'}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          restore.mutate(item.id, {
            onSuccess: (r) => toast.success(`Restored ${r.fileName}`),
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        <ArchiveRestoreIcon />
        Restore
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Delete ${item.fileName} for good`}
            onClick={() =>
              remove.mutate(item.id, { onError: (err) => toast.error(errorMessage(err)) })
            }
          >
            <XIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete for good</TooltipContent>
      </Tooltip>
    </li>
  )
}
