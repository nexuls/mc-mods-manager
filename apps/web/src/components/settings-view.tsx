import { zodResolver } from '@hookform/resolvers/zod'
import {
  CurseForgeKey,
  ExportDirName,
  Provider,
  providerLabel,
  type Settings,
} from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  XCircleIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ProviderLogo } from '@/components/mod-chips'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useSettings, useTestCurseforgeKey, useUpdateSettings } from '@/hooks/use-settings'
import { errorMessage } from '@/lib/api'

const CONSOLE_URL = 'https://console.curseforge.com/'

/** `/settings`: CurseForge key, preferences and theme. Saved to the global config, not the instance. */
export function SettingsView() {
  const settings = useSettings()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          These apply to every instance you open with mc-mod.
        </p>
      </div>

      {settings.isPending ? (
        <>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </>
      ) : settings.isError ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>{errorMessage(settings.error)}</AlertDescription>
        </Alert>
      ) : (
        <>
          <CurseForgeCard settings={settings.data} />
          <PreferencesCard settings={settings.data} />
          <AppearanceCard />
          <p className="text-muted-foreground text-xs break-all">
            Saved in {settings.data.configPath}
          </p>
        </>
      )}
    </div>
  )
}

const KeyForm = z.object({ apiKey: CurseForgeKey })
type KeyForm = z.infer<typeof KeyForm>

function CurseForgeCard({ settings }: { settings: Settings }) {
  const update = useUpdateSettings()
  const test = useTestCurseforgeKey()
  const form = useForm<KeyForm>({ resolver: zodResolver(KeyForm), defaultValues: { apiKey: '' } })
  const fromEnv = settings.curseforgeKeySource === 'env'

  const save = form.handleSubmit(async ({ apiKey }) => {
    // Test first, so a typo doesn't quietly break every CurseForge request.
    const result = await test.mutateAsync(apiKey)
    if (!result.ok) return
    await update.mutateAsync({ curseforgeApiKey: apiKey })
    form.reset()
    toast.success('CurseForge key saved')
  })

  const testTyped = async () => {
    if (!form.getValues('apiKey').trim()) {
      test.mutate(undefined)
      return
    }
    const valid = await form.trigger('apiKey')
    if (valid) test.mutate(form.getValues('apiKey'))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ProviderLogo provider="curseforge" className="size-4 text-[#F16436]" />
          CurseForge
          {settings.curseforgeKeySet ? (
            <Badge variant="secondary">{fromEnv ? 'Key from environment' : 'Key saved'}</Badge>
          ) : (
            <Badge variant="outline">Not set up</Badge>
          )}
        </CardTitle>
        <CardDescription>
          CurseForge only lets apps in with an API key, so you need your own. Create one for free in
          the{' '}
          <a
            href={CONSOLE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-foreground inline-flex items-center gap-0.5 underline underline-offset-2"
          >
            CurseForge console
            <ExternalLinkIcon className="size-3" />
          </a>
          , then paste it here. It stays on this computer and is never sent to the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fromEnv && (
          <Alert>
            <AlertTriangleIcon />
            <AlertDescription>
              The CURSEFORGE_API_KEY environment variable is set, so it's used instead of a saved
              key.
            </AlertDescription>
          </Alert>
        )}
        <form id="curseforge-key" onSubmit={save}>
          <Controller
            name="apiKey"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="curseforge-key-input">
                  {settings.curseforgeKeySource === 'config' ? 'Replace API key' : 'API key'}
                </FieldLabel>
                <Input
                  {...field}
                  id="curseforge-key-input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={settings.curseforgeKeySet ? '••••••••••••' : 'Paste your key'}
                  aria-invalid={fieldState.invalid}
                  onChange={(e) => {
                    field.onChange(e)
                    test.reset()
                  }}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </form>
        {test.data && (
          <p
            className={
              test.data.ok
                ? 'flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400'
                : 'text-destructive flex items-center gap-1.5 text-sm'
            }
          >
            {test.data.ok ? (
              <CheckCircle2Icon className="size-4" />
            ) : (
              <XCircleIcon className="size-4" />
            )}
            {test.data.message}
          </p>
        )}
        {(test.error ?? update.error) && (
          <p className="text-destructive text-sm">{errorMessage(test.error ?? update.error)}</p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="submit" form="curseforge-key" disabled={test.isPending || update.isPending}>
          {test.isPending ? 'Checking…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={test.isPending || (!settings.curseforgeKeySet && !form.watch('apiKey'))}
          onClick={() => void testTyped()}
        >
          Test
        </Button>
        {settings.curseforgeKeySource === 'config' && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { curseforgeApiKey: null },
                { onSuccess: () => toast.success('CurseForge key removed') },
              )
            }
          >
            Remove key
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

const ExportForm = z.object({ exportDirName: ExportDirName })
type ExportForm = z.infer<typeof ExportForm>

function PreferencesCard({ settings }: { settings: Settings }) {
  const update = useUpdateSettings()
  const form = useForm<ExportForm>({
    resolver: zodResolver(ExportForm),
    values: { exportDirName: settings.exportDirName },
  })
  const saved = (label: string) => ({
    onSuccess: () => toast.success(label),
    onError: (err: unknown) => toast.error(errorMessage(err)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="preferred-provider">Preferred provider</FieldLabel>
              <FieldDescription>
                Used for updates and project pages when a file is on both platforms.
              </FieldDescription>
            </FieldContent>
            <Select
              value={settings.preferredProvider}
              onValueChange={(v) => {
                const p = Provider.safeParse(v)
                if (p.success) {
                  update.mutate(
                    { preferredProvider: p.data },
                    saved(`Preferring ${providerLabel[p.data]}`),
                  )
                }
              }}
            >
              <SelectTrigger id="preferred-provider" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Provider.options.map((p) => (
                  <SelectItem key={p} value={p}>
                    <ProviderLogo provider={p} className="size-3.5" />
                    {providerLabel[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="allow-prerelease">Allow pre-releases</FieldLabel>
              <FieldDescription>
                Recommend a beta or alpha when it's newer than the latest release.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="allow-prerelease"
              checked={settings.allowPrerelease}
              disabled={update.isPending}
              onCheckedChange={(allowPrerelease) =>
                update.mutate(
                  { allowPrerelease },
                  saved(allowPrerelease ? 'Pre-releases allowed' : 'Releases preferred'),
                )
              }
            />
          </Field>

          <form
            onSubmit={form.handleSubmit((v) =>
              update.mutate(v, saved(`Server exports go to ${v.exportDirName}/`)),
            )}
          >
            <Controller
              name="exportDirName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="export-dir">Server export folder</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      {...field}
                      id="export-dir"
                      className="max-w-64"
                      aria-invalid={fieldState.invalid}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={!form.formState.isDirty || update.isPending}
                    >
                      Save
                    </Button>
                  </div>
                  <FieldDescription>
                    Created inside the instance folder when you export server mods.
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </form>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

const THEMES = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
] as const

/** Theme lives in this browser (next-themes), not in the config file. */
function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Saved in this browser.</CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          type="single"
          variant="outline"
          value={theme ?? 'system'}
          onValueChange={(v) => v && setTheme(v)}
          aria-label="Theme"
        >
          {THEMES.map(({ value, label, Icon }) => (
            <ToggleGroupItem key={value} value={value} className="px-3">
              <Icon />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}
