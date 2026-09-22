import { zodResolver } from '@hookform/resolvers/zod'
import {
  ExportDirName,
  ExportMode,
  type ExportPreview,
  type ExportResult,
  type InstalledMod,
  type Settings,
} from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FolderIcon,
  FolderOpenIcon,
  PackageCheckIcon,
  ServerIcon,
} from 'lucide-react'
import { useState } from 'react'
import { type Control, Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ModSide } from '@/components/mod-side'
import { ProjectIcon } from '@/components/project-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useExportPreview, useRevealExport, useRunExport } from '@/hooks/use-export'
import { useSettings } from '@/hooks/use-settings'
import { errorMessage } from '@/lib/api'
import { displayName, displayVersion, primary } from '@/lib/mods'
import { cn } from '@/lib/utils'

const Header = () => (
  <div className="flex flex-col gap-1">
    <h1 className="text-2xl font-semibold tracking-tight">Server export</h1>
    <p className="text-muted-foreground text-sm">
      Copies the mods a server needs into a folder or a zip, ready to upload. Your mods folder isn't
      changed.
    </p>
  </div>
)

/** `/export`: the server-side mods, copied to a folder or zipped (architecture §7.6). */
export function ExportView({ plugins }: { plugins: boolean }) {
  const settings = useSettings()

  if (plugins) {
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        <Header />
        <Alert>
          <ServerIcon />
          <AlertTitle>Nothing to export</AlertTitle>
          <AlertDescription>
            Plugins only run on the server, so this folder already is what the server needs.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Header />
      {settings.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : settings.isError ? (
        <ErrorAlert error={settings.error} />
      ) : (
        <ExportPanel settings={settings.data} />
      )}
    </div>
  )
}

function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertDescription>{errorMessage(error)}</AlertDescription>
    </Alert>
  )
}

const ExportForm = z.object({
  dirName: ExportDirName,
  mode: ExportMode,
  clean: z.boolean(),
})
type ExportForm = z.infer<typeof ExportForm>

function ExportPanel({ settings }: { settings: Settings }) {
  const form = useForm<ExportForm>({
    resolver: zodResolver(ExportForm),
    defaultValues: { dirName: settings.exportDirName, mode: 'copy', clean: true },
    mode: 'onChange',
  })
  // The preview follows the folder name once it's valid and the field is left, not on every key.
  const [dirName, setDirName] = useState(settings.exportDirName)
  const preview = useExportPreview(dirName)
  const run = useRunExport()
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)

  const applyDirName = () => {
    const parsed = ExportDirName.safeParse(form.getValues('dirName'))
    if (parsed.success) setDirName(parsed.data)
  }

  const toggle = (fileName: string, include: boolean) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (include) next.delete(fileName)
      else next.add(fileName)
      return next
    })

  const p = preview.data
  const files = p
    ? [...p.include, ...p.unknown].map((m) => m.fileName).filter((f) => !skipped.has(f))
    : []
  const count = files.length
  // What a clean copy deletes: jars in the folder that this export doesn't write again.
  const stale = p ? p.existingJars.filter((f) => !files.includes(f)).length : 0

  const exportNow = (v: ExportForm) => {
    setResult(null)
    run.mutate(
      {
        mode: v.mode,
        dirName: v.dirName,
        clean: v.mode === 'copy' && v.clean,
        exclude: [...skipped],
      },
      {
        onSuccess: (r) => {
          setResult(r)
          toast.success(`Exported ${plural(r.count, 'mod')}`)
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    )
  }

  const submit = form.handleSubmit((v) => {
    // A name typed and submitted with Enter: show what's in that folder first, then export on the next click.
    if (v.dirName !== p?.dirName) {
      setDirName(v.dirName)
      return
    }
    // Only ask when a clean copy would actually delete something.
    if (v.mode === 'copy' && v.clean && stale > 0) {
      setConfirming(true)
      return
    }
    exportNow(v)
  })

  return (
    <>
      <Card>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Controller
                name="dirName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="export-dir">Folder name</FieldLabel>
                    <Input
                      {...field}
                      id="export-dir"
                      className="max-w-72"
                      aria-invalid={fieldState.invalid}
                      onBlur={() => {
                        field.onBlur()
                        applyDirName()
                      }}
                    />
                    <FieldDescription className="wrap-break-word">
                      {p ? `In ${parentOf(p.dir)}. ` : ''}The default is set in Settings.
                    </FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                name="mode"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Format</FieldLabel>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={field.value}
                      onValueChange={(v: string) => {
                        const mode = ExportMode.safeParse(v)
                        if (mode.success) field.onChange(mode.data)
                      }}
                      aria-label="Format"
                      className="self-start"
                    >
                      <ToggleGroupItem value="copy" className="px-3">
                        <FolderIcon />
                        Folder
                      </ToggleGroupItem>
                      <ToggleGroupItem value="zip" className="px-3">
                        <PackageCheckIcon />
                        Zip
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <FieldDescription className="wrap-break-word">
                      {field.value === 'copy'
                        ? `Jars go into ${p?.dirName ?? dirName}/.`
                        : `One file in the instance folder: ${p?.zipName ?? '…'}`}
                    </FieldDescription>
                  </Field>
                )}
              />

              <CleanField control={form.control} stale={stale} />

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!p || count === 0 || run.isPending}>
                  <ServerIcon />
                  {run.isPending ? 'Exporting…' : `Export ${plural(count, 'mod')}`}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {result && <ResultAlert result={result} dirName={p?.dirName} />}

      {preview.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : preview.isError ? (
        <ErrorAlert error={preview.error} />
      ) : (
        <Groups preview={preview.data} skipped={skipped} onToggle={toggle} />
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the earlier export?</AlertDialogTitle>
            <AlertDialogDescription>
              {plural(stale, 'old jar')} in {p?.dirName}/ will be removed after the new ones are
              copied. Jars with the same name are replaced, and other files are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => exportNow(form.getValues())}>
              Export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** The copy-only "remove earlier jars" switch. */
function CleanField({ control, stale }: { control: Control<ExportForm>; stale: number }) {
  const mode = useWatch({ control, name: 'mode' })
  if (mode !== 'copy') return null
  return (
    <Controller
      name="clean"
      control={control}
      render={({ field }) => (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="export-clean">Remove earlier exports</FieldLabel>
            <FieldDescription>
              {stale > 0
                ? `${plural(stale, 'old jar')} in the folder would be removed. Other files are kept.`
                : 'Removes jars left from an earlier export. Other files are kept.'}
            </FieldDescription>
          </FieldContent>
          <Switch id="export-clean" checked={field.value} onCheckedChange={field.onChange} />
        </Field>
      )}
    />
  )
}

function ResultAlert({ result, dirName }: { result: ExportResult; dirName: string | undefined }) {
  const reveal = useRevealExport()
  const open = () =>
    reveal.mutate(
      { mode: result.mode, dirName },
      {
        onSuccess: (r) => {
          if (!r.opened) toast.info(`Couldn't open a file manager. The folder is ${r.path}`)
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    )
  return (
    <Alert>
      <CheckCircle2Icon />
      <AlertTitle>
        Exported {plural(result.count, 'mod')}
        {result.removed > 0 && `, removed ${plural(result.removed, 'old jar')}`}
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <code className="text-xs break-all">{result.path}</code>
        <Button variant="outline" size="sm" onClick={open} disabled={reveal.isPending}>
          <FolderOpenIcon />
          Open folder
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function Groups({
  preview,
  skipped,
  onToggle,
}: {
  preview: ExportPreview
  skipped: ReadonlySet<string>
  onToggle: (fileName: string, include: boolean) => void
}) {
  return (
    <>
      <Group
        title="Included"
        description="Mods that run on the server, or on both sides."
        mods={preview.include}
        skipped={skipped}
        onToggle={onToggle}
      />
      {preview.unknown.length > 0 && (
        <Group
          title="Needs review"
          description="Nobody knows where these run. They're exported unless you untick them. Set a side to decide for good."
          mods={preview.unknown}
          skipped={skipped}
          onToggle={onToggle}
          warn
        />
      )}
      <Group
        title="Excluded"
        description="Client-only and disabled mods. A server doesn't need them."
        mods={preview.exclude}
        skipped={skipped}
      />
    </>
  )
}

function Group({
  title,
  description,
  mods,
  skipped,
  onToggle,
  warn,
}: {
  title: string
  description: string
  mods: InstalledMod[]
  skipped: ReadonlySet<string>
  /** Rows get a checkbox; the excluded group has none. */
  onToggle?: (fileName: string, include: boolean) => void
  warn?: boolean
}) {
  const sorted = [...mods].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' }),
  )
  return (
    <Card className={cn(warn && 'border-amber-500/40')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <Badge variant="secondary">{mods.length}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {sorted.map((m) => (
              <ExportRow
                key={m.fileName}
                mod={m}
                included={onToggle ? !skipped.has(m.fileName) : undefined}
                onToggle={onToggle}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ExportRow({
  mod,
  included,
  onToggle,
}: {
  mod: InstalledMod
  included: boolean | undefined
  onToggle?: (fileName: string, include: boolean) => void
}) {
  const name = displayName(mod)
  const version = displayVersion(mod)
  const id = `export-${mod.fileName}`
  return (
    <li className="hover:bg-muted/50 flex items-center gap-3 rounded-lg px-2 py-1.5">
      {onToggle && (
        <Checkbox
          id={id}
          checked={included}
          onCheckedChange={(v) => onToggle(mod.fileName, v === true)}
          aria-label={`Export ${name}`}
        />
      )}
      <ProjectIcon
        url={primary(mod)?.iconUrl}
        className={cn('size-8 rounded-md', included === false && 'opacity-50 grayscale')}
      />
      <label
        htmlFor={onToggle ? id : undefined}
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          included === false && 'text-muted-foreground line-through decoration-1',
        )}
      >
        <span className="truncate text-sm font-medium" title={name}>
          {name}
          {version && <span className="text-muted-foreground ml-2 font-normal">{version}</span>}
        </span>
        <span className="text-muted-foreground truncate text-xs" title={mod.fileName}>
          {mod.fileName}
        </span>
      </label>
      {!mod.enabled && <Badge variant="outline">Disabled</Badge>}
      <ModSide mod={mod} />
    </li>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The folder that holds `dir`, for "In /path/to/instance". Works for / and \ separators. */
function parentOf(dir: string): string {
  const i = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
  return i > 0 ? dir.slice(0, i) : dir
}
