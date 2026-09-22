import {
  type InstalledMod,
  type Project,
  type Provider,
  providerLabel,
  type RankedVersion,
} from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowUpCircleIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HeartIcon,
  ScaleIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, type To } from 'react-router'
import { InstallDialog, type InstallTarget } from '@/components/install-dialog'
import { Markdown } from '@/components/markdown'
import { ProviderLogo, SideChip } from '@/components/mod-chips'
import { ProjectIcon } from '@/components/project-icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UpdateDialog } from '@/components/update-dialog'
import { useProject, useVersions } from '@/hooks/use-catalog'
import { projectKey, useInstalledProjects } from '@/hooks/use-mods'
import { errorMessage } from '@/lib/api'
import { compactNumber, shortDate, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * `/project/:provider/:id`, shown over the Browse list: description, versions and gallery, with an install
 * button. `back` returns to the list.
 */
export function ProjectView({ provider, id, back }: { provider: Provider; id: string; back: To }) {
  const project = useProject(provider, id)
  const [target, setTarget] = useState<InstallTarget | null>(null)
  const install = (p: Project, versionId?: string) =>
    setTarget({ provider: p.provider, projectId: p.id, versionId, title: p.title })

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 self-start">
        <Link to={back}>
          <ArrowLeftIcon />
          Back to results
        </Link>
      </Button>

      {project.isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : project.isError ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>{errorMessage(project.error)}</AlertDescription>
        </Alert>
      ) : (
        <>
          <ProjectHeader project={project.data} onInstall={(v) => install(project.data, v)} />
          <Tabs defaultValue="description" className="bg-card rounded-xl border p-4">
            <TabsList>
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger value="versions">Versions</TabsTrigger>
              {project.data.gallery.length > 0 && (
                <TabsTrigger value="gallery">Gallery ({project.data.gallery.length})</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="description" className="pt-4">
              {project.data.body ? (
                <Markdown>{project.data.body}</Markdown>
              ) : (
                <p className="text-muted-foreground">{project.data.description}</p>
              )}
            </TabsContent>
            <TabsContent value="versions" className="pt-4">
              <VersionsTable project={project.data} onInstall={(v) => install(project.data, v)} />
            </TabsContent>
            <TabsContent value="gallery" className="pt-4">
              <Gallery project={project.data} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <InstallDialog target={target} onOpenChange={(o) => !o && setTarget(null)} />
    </div>
  )
}

function ProjectHeader({
  project: p,
  onInstall,
}: {
  project: Project
  onInstall: (versionId: string | undefined) => void
}) {
  const versions = useVersions(p.provider, p.id, false)
  const installed = useInstalledProjects().get(projectKey(p.provider, p.id))
  const compatible = versions.data?.versions.filter((v) => v.compatible && v.file) ?? []
  const recommended = compatible.find((v) => v.recommended)
  const [picked, setPicked] = useState<string | undefined>()
  const selected = picked ?? recommended?.id
  const [updating, setUpdating] = useState<InstalledMod[] | null>(null)

  return (
    // Side by side when the pane is wide enough, not the window: in the split view it's a column.
    <div className="flex flex-col gap-5 rounded-xl border p-5 @3xl:flex-row @3xl:items-start">
      <div className="flex min-w-0 flex-1 gap-4">
        <ProjectIcon url={p.iconUrl} className="size-20 rounded-xl" />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
          <p className="text-muted-foreground">{p.description}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1">
              <DownloadIcon className="size-4" />
              {compactNumber(p.downloads)}
            </span>
            {p.follows !== undefined && (
              <span className="flex items-center gap-1">
                <HeartIcon className="size-4" />
                {compactNumber(p.follows)}
              </span>
            )}
            {p.updatedAt && <span>Updated {timeAgo(p.updatedAt)}</span>}
            {p.license && (
              <span className="flex items-center gap-1">
                <ScaleIcon className="size-4" />
                {p.license}
              </span>
            )}
            {/* CurseForge has no side information, so its "unknown" says nothing. */}
            {(p.side !== 'unknown' || p.provider === 'modrinth') && <SideChip side={p.side} />}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" asChild>
              <a href={p.pageUrl} target="_blank" rel="noreferrer noopener">
                <ProviderLogo provider={p.provider} />
                {providerLabel[p.provider]}
                <ExternalLinkIcon />
              </a>
            </Button>
            {p.links.map((l) => (
              <Button key={l.url} variant="ghost" size="sm" asChild>
                <a href={l.url} target="_blank" rel="noreferrer noopener">
                  {l.label}
                  <ExternalLinkIcon />
                </a>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 @3xl:w-72">
        {installed?.update ? (
          <>
            <Button onClick={() => setUpdating([installed])}>
              <ArrowUpCircleIcon />
              Update to {installed.update.versionNumber}
            </Button>
            <p className="text-muted-foreground truncate text-xs" title={installed.fileName}>
              Installed as {installed.fileName}
            </p>
          </>
        ) : installed ? (
          <>
            <Button variant="secondary" disabled>
              <CheckIcon />
              Installed
            </Button>
            <p className="text-muted-foreground truncate text-xs" title={installed.fileName}>
              {installed.fileName}
            </p>
          </>
        ) : versions.isPending ? (
          <Skeleton className="h-18" />
        ) : versions.isError ? (
          <p className="text-destructive text-sm">{errorMessage(versions.error)}</p>
        ) : compatible.length === 0 ? (
          <>
            <Button disabled>
              <DownloadIcon />
              Install
            </Button>
            <p className="text-muted-foreground text-xs">
              No version for this instance. The Versions tab can list all of them.
            </p>
          </>
        ) : (
          <>
            <Select value={selected} onValueChange={setPicked}>
              <SelectTrigger className="w-full" aria-label="Version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {compatible.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <span className="truncate">{v.versionNumber}</span>
                    {v.recommended && <Badge variant="secondary">Recommended</Badge>}
                    {v.type !== 'release' && <Badge variant="outline">{v.type}</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => onInstall(selected === recommended?.id ? undefined : selected)}>
              <DownloadIcon />
              Install
            </Button>
          </>
        )}
      </div>
      <UpdateDialog mods={updating} onOpenChange={(o) => !o && setUpdating(null)} />
    </div>
  )
}

function VersionsTable({
  project,
  onInstall,
}: {
  project: Project
  onInstall: (versionId: string) => void
}) {
  const [all, setAll] = useState(false)
  const versions = useVersions(project.provider, project.id, all)
  const list = versions.data?.versions ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          {versions.data
            ? `${list.length} ${all ? '' : 'compatible '}${list.length === 1 ? 'version' : 'versions'}`
            : 'Loading versions…'}
        </p>
        <div className="flex items-center gap-2">
          <Switch id="all-versions" checked={all} onCheckedChange={setAll} />
          <Label htmlFor="all-versions">Show all versions</Label>
        </div>
      </div>
      {versions.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : versions.isError ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>{errorMessage(versions.error)}</AlertDescription>
        </Alert>
      ) : list.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          No versions for this instance.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table className="[&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Loaders</TableHead>
                <TableHead>Game versions</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Downloads</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((v) => (
                <VersionRow key={v.id} version={v} onInstall={() => onInstall(v.id)} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function VersionRow({ version: v, onInstall }: { version: RankedVersion; onInstall: () => void }) {
  return (
    <TableRow className={cn(!v.compatible && 'text-muted-foreground')}>
      <TableCell className="max-w-72">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium" title={v.name}>
            {v.versionNumber}
          </span>
          {v.recommended && <Badge>Recommended</Badge>}
          {v.type !== 'release' && <Badge variant="outline">{v.type}</Badge>}
          {v.file && !v.file.url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline">Manual download</Badge>
              </TooltipTrigger>
              <TooltipContent>
                The author only allows downloading this file from the {providerLabel[v.provider]}{' '}
                website.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {v.note && <p className="text-muted-foreground text-xs">{v.note}</p>}
      </TableCell>
      <TableCell className="text-xs">{v.loaders.join(', ')}</TableCell>
      <TableCell className="max-w-48 text-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block truncate">{v.gameVersions.join(', ')}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-80">{v.gameVersions.join(', ')}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap">{shortDate(v.publishedAt)}</TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {compactNumber(v.downloads)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant={v.compatible ? 'outline' : 'ghost'}
          disabled={!v.file}
          onClick={onInstall}
        >
          <DownloadIcon />
          Install
        </Button>
      </TableCell>
    </TableRow>
  )
}

function Gallery({ project }: { project: Project }) {
  return (
    <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3">
      {project.gallery.map((g) => (
        <a
          key={g.url}
          href={g.rawUrl ?? g.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group flex flex-col gap-2"
        >
          <img
            src={g.url}
            alt={g.title ?? ''}
            loading="lazy"
            className="bg-muted aspect-video w-full rounded-lg border object-cover transition-opacity group-hover:opacity-90"
          />
          {(g.title || g.description) && (
            <div className="flex flex-col gap-0.5">
              {g.title && <span className="text-sm font-medium">{g.title}</span>}
              {g.description && (
                <span className="text-muted-foreground line-clamp-2 text-xs">{g.description}</span>
              )}
            </div>
          )}
        </a>
      ))}
    </div>
  )
}
