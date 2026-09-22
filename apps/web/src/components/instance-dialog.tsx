import { zodResolver } from '@hookform/resolvers/zod'
import {
  GameVersion,
  type InstanceField,
  type InstanceOverrides,
  type InstanceResponse,
  Loader,
  LoaderVersion,
} from '@mc-mod/shared'
import { AlertTriangleIcon } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateInstance } from '@/hooks/use-instance'
import { ApiClientError } from '@/lib/api'
import { loaderGroups, loaderLabel } from '@/lib/instance'

/** The form edits strings; empty optional fields mean "no override". */
const FormSchema = z.object({
  gameVersion: GameVersion,
  loader: z.string().pipe(Loader.exclude(['vanilla'], { error: 'Pick a loader' })),
  loaderVersion: z.union([z.literal(''), LoaderVersion]),
  contentDir: z.string().trim(),
})
type FormInput = z.input<typeof FormSchema>
type FormOutput = z.output<typeof FormSchema>

function toOverrides(v: FormOutput): InstanceOverrides {
  return {
    gameVersion: v.gameVersion,
    loader: v.loader,
    loaderVersion: v.loaderVersion || undefined,
    contentDir: v.contentDir || undefined,
  }
}

/** `mods` for `<root>/mods`; other paths stay absolute. */
function relativeTo(root: string, p: string): string {
  const prefix = [`${root}/`, `${root}\\`].find((x) => p.startsWith(x))
  return prefix ? p.slice(prefix.length) : p
}

const fieldLabel: Record<InstanceField, string> = {
  kind: 'instance type',
  gameVersion: 'game version',
  loader: 'loader',
  loaderVersion: 'loader version',
  contentDir: 'content folder',
}

const confidenceVariant = { high: 'default', medium: 'secondary', low: 'outline' } as const

export function InstanceDialog({
  data,
  open,
  onOpenChange,
}: {
  data: InstanceResponse
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { instance, needsSetup } = data
  const update = useUpdateInstance()
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(FormSchema),
    values: {
      gameVersion: instance.gameVersion ?? '',
      loader: instance.loader && instance.loader !== 'vanilla' ? instance.loader : '',
      loaderVersion: instance.loaderVersion ?? '',
      contentDir: '',
    },
    resetOptions: { keepDirtyValues: true },
  })

  // During setup the dialog can't be dismissed: there's nothing to show without an instance.
  const blocking = needsSetup
  const submit = form.handleSubmit(async (v) => {
    await update.mutateAsync(toOverrides(v))
    onOpenChange(false)
  })
  const error =
    update.error instanceof ApiClientError ? update.error.message : update.error ? 'Failed' : null

  return (
    <Dialog open={open || blocking} onOpenChange={(o) => !blocking && onOpenChange(o)}>
      <DialogContent
        // min-w-0 on every section: long paths must wrap, not widen the grid past the panel.
        className="*:min-w-0 sm:max-w-lg"
        showCloseButton={!blocking}
        onEscapeKeyDown={(e) => blocking && e.preventDefault()}
        onInteractOutside={(e) => blocking && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{blocking ? 'Set up this instance' : 'Instance'}</DialogTitle>
          <DialogDescription className="break-all">{instance.root}</DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          mc-mod uses these to pick compatible mods, versions and updates. They don't change the
          game or its loader: do that in your launcher, then match it here.
        </p>

        {instance.warnings.map((w) => (
          <Alert key={w}>
            <AlertTriangleIcon />
            <AlertDescription>{w}</AlertDescription>
          </Alert>
        ))}

        {instance.suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">Found in this folder</span>
            <div className="flex flex-wrap gap-2">
              {instance.suggestions.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const opts = { shouldDirty: true, shouldValidate: true }
                    form.setValue('gameVersion', s.gameVersion, opts)
                    if (s.loader && s.loader !== 'vanilla') form.setValue('loader', s.loader, opts)
                    form.setValue('loaderVersion', s.loaderVersion ?? '', opts)
                  }}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <form id="instance-form" onSubmit={submit}>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Controller
                name="gameVersion"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="gameVersion">Game version</FieldLabel>
                    <Input
                      {...field}
                      id="gameVersion"
                      placeholder="1.21.1"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="loader"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="loader">Loader</FieldLabel>
                    <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="loader" aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="Choose a loader" />
                      </SelectTrigger>
                      <SelectContent>
                        {loaderGroups.map((g) => (
                          <SelectGroup key={g.label}>
                            <SelectLabel>{g.label}</SelectLabel>
                            {g.loaders.map((l) => (
                              <SelectItem key={l} value={l}>
                                {loaderLabel(l)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
            <Controller
              name="loaderVersion"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="loaderVersion">Loader version</FieldLabel>
                  <Input
                    {...field}
                    id="loaderVersion"
                    placeholder="Optional"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="contentDir"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="contentDir">Content folder</FieldLabel>
                  <Input
                    {...field}
                    id="contentDir"
                    placeholder={relativeTo(instance.root, instance.contentDir)}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Leave empty to use the detected folder. Must be inside the instance.
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        {instance.detection.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">Detected from</span>
            <ul className="flex flex-col gap-1.5">
              {instance.detection.map((d) => (
                <li key={`${d.source}|${d.detail}`} className="flex items-start gap-2">
                  <Badge variant={confidenceVariant[d.confidence]} className="shrink-0">
                    {d.confidence}
                  </Badge>
                  <span className="min-w-0">
                    <span className="block">{d.source}</span>
                    {d.fields.length > 0 && (
                      <span className="text-muted-foreground block text-xs">
                        Provided the {d.fields.map((f) => fieldLabel[f]).join(', ')}
                      </span>
                    )}
                    <span className="text-muted-foreground block text-xs break-all">
                      {d.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          {!blocking && (
            <Button
              type="button"
              variant="ghost"
              disabled={update.isPending}
              onClick={async () => {
                await update.mutateAsync({})
                form.reset()
                onOpenChange(false)
              }}
            >
              Reset to detected
            </Button>
          )}
          <Button type="submit" form="instance-form" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
