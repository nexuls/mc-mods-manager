import type { InstalledMod } from '@mc-mod/shared'
import { DownloadIcon, PackageIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useModSuggestions, useUpdateMod } from '@/hooks/use-mods'
import { errorMessage } from '@/lib/api'
import { displayName, parseModrinthRef } from '@/lib/mods'

const compact = new Intl.NumberFormat(undefined, { notation: 'compact' })

/** "Link to project…": pick a possible match or type a Modrinth page/slug. Saved as a manual link. */
export function LinkDialog({
  mod,
  open,
  onOpenChange,
}: {
  mod: InstalledMod
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const suggestions = useModSuggestions(mod.fileName, open)
  const update = useUpdateMod()
  const [ref, setRef] = useState('')
  const [touched, setTouched] = useState(false)
  const manual = mod.sources.find((s) => s.method === 'manual')
  const parsed = parseModrinthRef(ref)

  const link = (projectId: string) =>
    update.mutate(
      { fileName: mod.fileName, body: { link: { provider: 'modrinth', projectId } } },
      {
        onSuccess: (m) => {
          toast.success(`Linked ${m.fileName} to ${displayName(m)}`)
          setRef('')
          onOpenChange(false)
        },
      },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="*:min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link to project</DialogTitle>
          <DialogDescription className="break-all">
            {mod.sources.length === 0
              ? `${mod.fileName} didn't match any file on Modrinth exactly. Pick the project it belongs to, so its page and updates work.`
              : `Link ${mod.fileName} to a project by hand. An exact file match still wins over your link.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs">Possible matches</span>
          {suggestions.isPending ? (
            <>
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </>
          ) : suggestions.isError ? (
            <p className="text-destructive text-sm">{errorMessage(suggestions.error)}</p>
          ) : suggestions.data.suggestions.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing similar on Modrinth.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {suggestions.data.suggestions.map((s) => (
                <li key={s.projectId}>
                  <button
                    type="button"
                    disabled={update.isPending}
                    onClick={() => link(s.projectId)}
                    className="hover:bg-muted flex w-full items-start gap-3 rounded-md p-2 text-left disabled:opacity-50"
                  >
                    {s.iconUrl ? (
                      <img src={s.iconUrl} alt="" className="size-10 shrink-0 rounded-md" />
                    ) : (
                      <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
                        <PackageIcon className="text-muted-foreground size-4" />
                      </div>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{s.title}</span>
                        <Badge variant="outline" className="shrink-0">
                          {s.reason}
                        </Badge>
                      </span>
                      <span className="text-muted-foreground line-clamp-1 text-xs">
                        {s.description}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-2 text-xs">
                        {s.author && <span>by {s.author}</span>}
                        {s.downloads !== undefined && (
                          <span className="flex items-center gap-0.5">
                            <DownloadIcon className="size-3" />
                            {compact.format(s.downloads)}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            setTouched(true)
            if (parsed) link(parsed)
          }}
        >
          <Field data-invalid={touched && !parsed}>
            <FieldLabel htmlFor="link-ref">Or enter a Modrinth project</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="link-ref"
                value={ref}
                placeholder="https://modrinth.com/mod/sodium"
                aria-invalid={touched && !parsed}
                onChange={(e) => setRef(e.target.value)}
              />
              <Button type="submit" disabled={update.isPending || !ref.trim()}>
                Link
              </Button>
            </div>
            <FieldDescription>A page URL, slug or project id.</FieldDescription>
            {touched && !parsed && (
              <FieldError errors={[{ message: 'Not a Modrinth URL, slug or id' }]} />
            )}
          </Field>
        </form>

        {update.error && <p className="text-destructive text-sm">{errorMessage(update.error)}</p>}

        {manual && (
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { fileName: mod.fileName, body: { link: null } },
                  { onSuccess: () => onOpenChange(false) },
                )
              }
            >
              Remove link to {manual.title ?? manual.projectId}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
