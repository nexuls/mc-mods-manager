import { type InstalledMod, Provider, providerLabel } from '@mc-mod/shared'
import { DownloadIcon, PackageIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ProviderLogo } from '@/components/mod-chips'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useModSuggestions, useUpdateMod } from '@/hooks/use-mods'
import { useSettings } from '@/hooks/use-settings'
import { errorMessage } from '@/lib/api'
import { displayName, parseCurseForgeRef, parseModrinthRef } from '@/lib/mods'

const compact = new Intl.NumberFormat(undefined, { notation: 'compact' })

const refHelp: Record<Provider, { placeholder: string; description: string; invalid: string }> = {
  modrinth: {
    placeholder: 'https://modrinth.com/mod/sodium',
    description: 'A page URL, slug or project id.',
    invalid: 'Not a Modrinth URL, slug or id',
  },
  curseforge: {
    placeholder: 'https://www.curseforge.com/minecraft/mc-mods/jei',
    description: 'A page URL, or the project ID shown on its page.',
    invalid: 'Not a CurseForge URL, slug or id',
  },
}

/** "Link to project…": pick a possible match or enter a project page/slug/id. Saved as a manual link. */
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
  const cfReady = useSettings().data?.curseforgeKeySet ?? false
  const [provider, setProvider] = useState<Provider>('modrinth')
  const [ref, setRef] = useState('')
  const [touched, setTouched] = useState(false)
  const manual = mod.sources.find((s) => s.method === 'manual')
  const parsed =
    provider === 'modrinth' ? parseModrinthRef(ref) : parseCurseForgeRef(ref, { bareSlug: true })
  const help = refHelp[provider]

  const link = (target: Provider, projectId: string) =>
    update.mutate(
      { fileName: mod.fileName, body: { link: { provider: target, projectId } } },
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
              ? `${mod.fileName} didn't match any file on Modrinth${cfReady ? ' or CurseForge' : ''} exactly. Pick the project it belongs to, so its page and updates work.`
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
            <p className="text-muted-foreground text-sm">
              Nothing similar on Modrinth{cfReady ? ' or CurseForge' : ''}.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {suggestions.data.suggestions.map((s) => (
                <li key={`${s.provider}:${s.projectId}`}>
                  <button
                    type="button"
                    disabled={update.isPending}
                    onClick={() => link(s.provider, s.projectId)}
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
                        <ProviderLogo
                          provider={s.provider}
                          className="text-muted-foreground size-3.5 shrink-0"
                        />
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
            if (parsed) link(provider, parsed)
          }}
        >
          <Field data-invalid={touched && !parsed}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="link-ref">Or enter a project</FieldLabel>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={provider}
                onValueChange={(v) => {
                  const p = Provider.safeParse(v)
                  if (p.success) setProvider(p.data)
                }}
                aria-label="Platform"
              >
                {Provider.options.map((p) => (
                  <ToggleGroupItem
                    key={p}
                    value={p}
                    disabled={p === 'curseforge' && !cfReady}
                    title={
                      p === 'curseforge' && !cfReady
                        ? 'Add a CurseForge API key in Settings'
                        : undefined
                    }
                    className="px-2.5"
                  >
                    <ProviderLogo provider={p} />
                    {providerLabel[p]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex gap-2">
              <Input
                id="link-ref"
                value={ref}
                placeholder={help.placeholder}
                aria-invalid={touched && !parsed}
                onChange={(e) => setRef(e.target.value)}
              />
              <Button type="submit" disabled={update.isPending || !ref.trim()}>
                Link
              </Button>
            </div>
            <FieldDescription>{help.description}</FieldDescription>
            {touched && !parsed && <FieldError errors={[{ message: help.invalid }]} />}
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
