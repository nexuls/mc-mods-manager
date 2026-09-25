import {
  type ContentKind,
  type ImportPlan,
  MOD_LIST_FORMAT,
  MOD_LIST_VERSION,
  ModList,
} from '@mc-mod/shared'
import { AlertTriangleIcon, DownloadIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ImportDialog } from '@/components/import-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useImportPlan, useShareList } from '@/hooks/use-share'
import { errorMessage, issueList } from '@/lib/api'
import { plural } from '@/lib/format'

/**
 * Reads a file the browser handed us. It's JSON of unknown shape until `ModList` says otherwise, and
 * each way it can fail gets its own message: a silent "not a mod list" sent people looking in the
 * wrong place when the real problem was a newer format or one bad entry.
 */
function readList(text: string): { list: ModList } | { error: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { error: "isn't JSON. Pick the .json file mc-mod exported." }
  }
  const format = ListHeader.safeParse(json)
  if (!format.success || format.data.format !== MOD_LIST_FORMAT) {
    return { error: "isn't a mod list exported by mc-mod." }
  }
  if (format.data.formatVersion > MOD_LIST_VERSION) {
    return { error: 'was made by a newer mc-mod. Update mc-mod to import it.' }
  }
  const parsed = ModList.safeParse(json)
  if (!parsed.success)
    return { error: `has an entry mc-mod can't read — ${issueList(parsed.error)}` }
  return { list: parsed.data }
}

/** Just enough of a list to tell "not ours" from "ours, but newer" before the full parse. */
const ListHeader = z.object({ format: z.string(), formatVersion: z.number() })

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
    const parsed = readList(await file.text())
    if ('error' in parsed) {
      toast.error(`${file.name} ${parsed.error}`)
      return
    }
    plan.mutate(parsed.list, {
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
            Saves a JSON file with the game version, loader, loader version, Java version and every{' '}
            {thing} pinned to the exact build installed here — not the newest one, so importing it
            elsewhere reproduces this setup.
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
            Checks the list against this instance and lets you pick what to install. It takes the
            builds the list pinned, and {thing === 'mod' ? 'mods' : 'plugins'} you already have are
            left unticked. Anything with no build for this instance can still be installed from the
            dialog.
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
