import {
  type ContentKind,
  Loader,
  loaderInfo,
  type ProjectHit,
  type SearchResponse,
  type SearchSort,
  searchSortLabel,
} from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  HeartIcon,
  HistoryIcon,
  SearchIcon,
  SearchXIcon,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { InstallDialog, type InstallTarget } from '@/components/install-dialog'
import { ProviderLogo, sideIcon } from '@/components/mod-chips'
import { ProjectIcon } from '@/components/project-icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCategories, useSearch } from '@/hooks/use-catalog'
import { projectKey, useInstalledProjects } from '@/hooks/use-mods'
import { errorMessage } from '@/lib/api'
import { type BrowseState, parseBrowseParams, toBrowseParams, toSearchQuery } from '@/lib/browse'
import { compactNumber, shortDate, timeAgo } from '@/lib/format'
import { sideLabel } from '@/lib/mods'
import { cn } from '@/lib/utils'

const ALL_CATEGORIES = '_all'
const SEARCH_DEBOUNCE_MS = 300

export function BrowseView({ contentKind }: { contentKind: ContentKind }) {
  const [params, setParams] = useSearchParams()
  const state = parseBrowseParams(params)
  const update = (patch: Partial<BrowseState>, options: { replace?: boolean } = {}) =>
    setParams(toBrowseParams({ ...state, page: 0, ...patch }), options)

  // The input updates right away; the URL (and the search) follows after a pause in typing.
  const [text, setText] = useState(state.q)
  const pushed = useRef(state.q)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the typed text should trigger this
  useEffect(() => {
    const q = text.trim()
    if (q === state.q) return
    const t = setTimeout(() => {
      pushed.current = q
      update({ q }, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text])
  // Back/forward changes the URL without typing; follow it, but not our own debounced updates.
  useEffect(() => {
    if (state.q !== pushed.current) {
      pushed.current = state.q
      setText(state.q)
    }
  }, [state.q])

  const search = useSearch(toSearchQuery(state))
  const categories = useCategories(contentKind)
  const categoryLabels = useMemo(
    () => new Map(categories.data?.categories.map((c) => [c.name, c.label])),
    [categories.data],
  )
  const installed = useInstalledProjects()
  const [target, setTarget] = useState<InstallTarget | null>(null)

  const data = search.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const noun = contentKind === 'plugin' ? 'plugins' : 'mods'
  const goToPage = (page: number) => {
    update({ page })
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Browse {noun}</h1>
          <p className="text-muted-foreground text-sm">{describeFilters(data?.filters, noun)}</p>
        </div>
        <Tabs value="modrinth">
          <TabsList>
            <TabsTrigger value="modrinth">
              <ProviderLogo provider="modrinth" className="size-3.5" />
              Modrinth
            </TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A span, since disabled buttons don't fire the hover events tooltips need. */}
                <span>
                  <TabsTrigger value="curseforge" disabled>
                    <ProviderLogo provider="curseforge" className="size-3.5" />
                    CurseForge
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>CurseForge needs an API key and isn't supported yet.</TooltipContent>
            </Tooltip>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-80">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Search ${noun} on Modrinth`}
            className="pl-8"
            aria-label={`Search ${noun}`}
            autoFocus
          />
        </div>
        <Select value={state.sort} onValueChange={(v) => update({ sort: toSort(v) })}>
          <SelectTrigger className="w-44" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(searchSortLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state.category ?? ALL_CATEGORIES}
          onValueChange={(v) => update({ category: v === ALL_CATEGORIES ? undefined : v })}
        >
          <SelectTrigger className="w-44" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories.data?.categories.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="show-incompatible"
            checked={state.all}
            onCheckedChange={(all) => update({ all })}
          />
          <Label htmlFor="show-incompatible">Show incompatible</Label>
        </div>
      </div>

      {search.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : search.isError ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>{errorMessage(search.error)}</AlertDescription>
        </Alert>
      ) : search.data.hits.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-20 text-center">
          <SearchXIcon className="text-muted-foreground size-10" />
          <p className="font-medium">No {noun} found</p>
          <p className="text-muted-foreground text-sm">
            {state.all ? 'Try other words.' : 'Try other words, or show incompatible ones too.'}
          </p>
        </div>
      ) : (
        <>
          <ul
            className={cn(
              'flex flex-col gap-3 transition-opacity',
              search.isPlaceholderData && 'opacity-60',
            )}
          >
            {search.data.hits.map((hit) => (
              <ProjectCard
                key={hit.id}
                hit={hit}
                categoryLabels={categoryLabels}
                installed={installed.has(projectKey(hit.provider, hit.id))}
                onInstall={() =>
                  setTarget({ provider: hit.provider, projectId: hit.id, title: hit.title })
                }
              />
            ))}
          </ul>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground text-sm tabular-nums">
              {compactNumber(search.data.total)} results · page {state.page + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={state.page === 0}
                onClick={() => goToPage(state.page - 1)}
              >
                <ChevronLeftIcon />
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={state.page + 1 >= pages}
                onClick={() => goToPage(state.page + 1)}
              >
                Next
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </>
      )}

      <InstallDialog target={target} onOpenChange={(o) => !o && setTarget(null)} />
    </div>
  )
}

function toSort(v: string): SearchSort {
  return Object.keys(searchSortLabel).find((k): k is SearchSort => k === v) ?? 'relevance'
}

/** `Showing Fabric mods for 1.21.4`, from the filters the server applied. */
function describeFilters(filters: SearchResponse['filters'] | undefined, noun: string): string {
  if (!filters) return `Find ${noun} for this instance`
  const [first] = filters.loaders
  if (!first && !filters.gameVersion) return `All ${noun}, compatible or not`
  const parts = [
    first && loaderInfo[first].label,
    noun,
    filters.gameVersion && `for ${filters.gameVersion}`,
  ]
  return `Showing ${parts.filter(Boolean).join(' ')}`
}

/** Categories shown on a card before the rest collapse into `+N`. */
const VISIBLE_TAGS = 2

function ProjectCard({
  hit,
  installed,
  onInstall,
  categoryLabels,
}: {
  hit: ProjectHit
  installed: boolean
  onInstall: () => void
  categoryLabels: ReadonlyMap<string, string>
}) {
  const href = `/project/${hit.provider}/${hit.slug || hit.id}`
  // Real categories first; loaders (also in the list) only count toward "+N".
  const labels = hit.categories.map((c) => ({
    label: categoryLabels.get(c) ?? loaderLabel(c) ?? c,
    loader: loaderLabel(c) !== undefined,
  }))
  const ordered = [...labels.filter((l) => !l.loader), ...labels.filter((l) => l.loader)]
  const shown = ordered.slice(0, VISIBLE_TAGS).filter((l) => !l.loader)
  const rest = ordered.slice(shown.length)
  const SideIcon = sideIcon(hit.side)

  return (
    <li className="bg-card hover:border-foreground/20 h-38 relative flex items-stretch gap-4 rounded-xl border p-4 transition-colors">
      <ProjectIcon url={hit.iconUrl} className="h-full size-auto rounded-2xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            to={href}
            className="truncate text-xl font-semibold hover:underline after:absolute after:inset-0"
          >
            {hit.title}
          </Link>
          {hit.author && (
            <span className="text-muted-foreground shrink-0 text-sm">by {hit.author}</span>
          )}
        </div>
        <p className="text-muted-foreground line-clamp-2">{hit.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {hit.side !== 'unknown' && (
            <Tag>
              <SideIcon />
              {sideLabel[hit.side]}
            </Tag>
          )}
          {shown.map((t) => (
            <Tag key={t.label}>{t.label}</Tag>
          ))}
          {rest.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Above the card-wide link, so the tooltip gets the hover. */}
                <span className="relative z-10">
                  <Tag>+{rest.length}</Tag>
                </span>
              </TooltipTrigger>
              <TooltipContent>{rest.map((t) => t.label).join(', ')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="h-full text-muted-foreground flex shrink-0 flex-col items-end justify-between gap-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5" title={`${hit.downloads} downloads`}>
            <DownloadIcon className="size-4" />
            {compactNumber(hit.downloads, true)}
          </span>
          {hit.follows !== undefined && (
            <span className="flex items-center gap-1.5" title={`${hit.follows} followers`}>
              <HeartIcon className="size-4" />
              {compactNumber(hit.follows)}
            </span>
          )}
        </div>
        {hit.updatedAt && (
          <span className="flex items-center gap-1.5" title={`Updated ${shortDate(hit.updatedAt)}`}>
            <HistoryIcon className="size-4" />
            {timeAgo(hit.updatedAt, Date.now(), true)}
          </span>
        )}
        {/* Above the card-wide link. */}
        <div className="relative z-10 mt-auto">
          {installed ? (
            <Button variant="secondary" disabled>
              <CheckIcon />
              Installed
            </Button>
          ) : (
            <Button onClick={onInstall}>
              <DownloadIcon />
              Install
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

/** Neutral pill for side and categories. */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5">
      {children}
    </span>
  )
}

function loaderLabel(name: string): string | undefined {
  const l = Loader.safeParse(name)
  return l.success ? loaderInfo[l.data].label : undefined
}
