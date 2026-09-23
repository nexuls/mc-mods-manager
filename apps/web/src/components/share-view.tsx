import { type ContentKind, type ImportPlan, ModList } from '@mc-mod/shared'
import { AlertTriangleIcon, DownloadIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ImportDialog } from '@/components/import-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useImportPlan, useShareList } from '@/hooks/use-share'
import { errorMessage } from '@/lib/api'
import { plural } from '@/lib/format'

/** A file the browser handed us is JSON of unknown shape until `ModList` says otherwise. */
const FileContents = z.string().transform((text, ctx) => {
  try {
    return ModList.parse(JSON.parse(text))
  } catch {
    ctx.addIssue({ code: 'custom', message: 'not a mod list' })
    return z.NEVER
  }
})

/**
 * `/share`: hand the instance's mod list to someone as a JSON file, or read theirs and install what's
 * missing (architecture §7.7). The file holds the game version, loader, Java and every mod.
 */
export function ShareView({ contentKind }: { contentKind: ContentKind }) {
  const thing = contentKind === 'plugin' ? 'plugin' : 'mod'
  const share = useShareList()
  const plan = useImportPlan()
  const input = useRef<HTMLInputElement>(null)
  const [opened, setOpened] = useState<{ plan: ImportPlan; fileName: string } | null>(null)

  const readFile = async (file: File) => {
    const parsed = FileContents.safeParse(await file.text())
    if (!parsed.success) {
      toast.error(`${file.name} isn't a mod list exported by mc-mod`)
      return
    }
    plan.mutate(parsed.data, {
      onSuccess: (p) => setOpened({ plan: p, fileName: file.name }),
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Share</h1>
        <p className="text-muted-foreground text-sm">
          Pass this setup on as a file, or set up from someone else's. Only the list travels; the
          jars are downloaded from Modrinth and CurseForge.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export the list</CardTitle>
          <CardDescription>
            Saves a JSON file with the game version, loader version, Java version and every {thing}{' '}
            with its version.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <Button
            onClick={() => share.mutate(undefined, { onError: onShareError })}
            disabled={share.isPending}
          >
            <DownloadIcon />
            {share.isPending ? 'Preparing…' : 'Export mod list'}
          </Button>
          {share.isSuccess && (
            <p className="text-muted-foreground text-sm">
              Saved {share.data.fileName} with {plural(share.data.list.mods.length, 'entry')}.
            </p>
          )}
          {share.isError && <ErrorAlert error={share.error} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import a list</CardTitle>
          <CardDescription>
            Checks the list against this instance and lets you pick what to install.{' '}
            {thing === 'mod' ? 'Mods' : 'Plugins'} you already have are left unticked.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Cleared so picking the same file again still fires a change.
              e.target.value = ''
              if (file) void readFile(file)
            }}
          />
          <Button
            variant="outline"
            onClick={() => input.current?.click()}
            disabled={plan.isPending}
          >
            <UploadIcon />
            {plan.isPending ? 'Reading…' : 'Import mod list'}
          </Button>
          {plan.isError && <ErrorAlert error={plan.error} />}
        </CardContent>
      </Card>

      <ImportDialog
        plan={opened?.plan ?? null}
        fileName={opened?.fileName ?? null}
        onOpenChange={(open) => !open && setOpened(null)}
      />
    </div>
  )
}

function onShareError(err: unknown): void {
  toast.error(errorMessage(err))
}

function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertDescription>{errorMessage(error)}</AlertDescription>
    </Alert>
  )
}
