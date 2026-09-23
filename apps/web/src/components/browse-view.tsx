import {
  type ContentKind,
  type InstalledMod,
  Loader,
  loaderInfo,
  type ProjectHit,
  Provider,
  providerLabel,
  type SearchResponse,
  type SearchSort,
  searchSortLabel,
} from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ArrowUpCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  HeartIcon,
  HistoryIcon,
  KeyRoundIcon,
  SearchXIcon,
} from 'lucide-react'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { InstallDialog, type InstallTarget } from '@/components/install-dialog'
import { ProviderLogo, sideIcon } from '@/components/mod-chips'
import { PageMessage } from '@/components/page-message'
import { ProjectIcon } from '@/components/project-icon'
import { ScrollPanel } from '@/components/scroll-panel'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UpdateDialog } from '@/components/update-dialog'
import { useCategories, useSearch } from '@/hooks/use-catalog'
import { projectKey, useInstalledProjects } from '@/hooks/use-mods'
import { usePageScroll } from '@/hooks/use-page-scroll'
import { useSettings } from '@/hooks/use-settings'
import { useSplitView } from '@/hooks/use-split-view'
import { errorMessage } from '@/lib/api'
import {
  type BrowseState,
  parseBrowseParams,
  projectLink,
  toBrowseParams,
  toSearchQuery,
} from '@/lib/browse'
import { compactNumber, shortDate, timeAgo } from '@/lib/format'
import { parseCurseForgeRef, sideLabel } from '@/lib/mods'
import { cn } from '@/lib/utils'

const ALL_CATEGORIES = '_all'

/** Catalog search; the text comes from the shared search bar through the URL. */
export function BrowseView({ contentKind }: { contentKind: ContentKind }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const state = parseBrowseParams(params)
  const update = (patch: Partial<BrowseState>, options: { replace?: boolean } = {}) =>
    setParams(toBrowseParams({ ...state, page: 0, ...patch }), options)

  const settings = useSettings()
  // CurseForge without a key: explain instead of showing an error.
  const needsKey = state.provider === 'curseforge' && settings.data?.curseforgeKeySet === false
  const canSearch = state.provider === 'modrinth' || settings.data?.curseforgeKeySet === true
  const search = useSearch(toSearchQuery(state), canSearch)
  // A pasted page URL or project id opens the project directly (some keys can't search at all).
  const cfRef = state.provider === 'curseforge' && canSearch ? parseCurseForgeRef(state.q) : null
  const categories = useCategories(contentKind, state.provider, canSearch)
  const categoryLabels = useMemo(
    () => new Map(categories.data?.categories.map((c) => [c.name, c.label])),
    [categories.data],
  )
  const installed = useInstalledProjects()
  const [target, setTarget] = useState<InstallTarget | null>(null)
  const [updating, setUpdating] = useState<InstalledMod[] | null>(null)

  const data = search.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const noun = contentKind === 'plugin' ? 'plugins' : 'mods'
  // The results scroll on their own in the split view, and with the page otherwise.
  const results = useRef<HTMLDivElement>(null)
  const pageScroll = usePageScroll()
  const { split } = useSplitView()
  const goToPage = (page: number) => {
    update({ page })
    results.current?.scrollTo({ top: 0 })
    pageScroll.current?.scrollTo({ top: 0 })
  }

  const hits = data && (
    <ul
      className={cn(
        // In the split the scrollbar gets a gutter instead of covering the cards' edge.
        'split:pr-3 flex flex-col gap-3 transition-opacity',
        search.isPlaceholderData && 'opacity-60',
      )}
    >
      {data.hits.map((hit) => (
        <ProjectCard
          key={hit.id}
          hit={hit}
          categoryLabels={categoryLabels}
          location={location}
          installed={installed.get(projectKey(hit.provider, hit.id))}
          onInstall={() =>
            setTarget({ provider: hit.provider, projectId: hit.id, title: hit.title })
          }
          onUpdate={(mod) => setUpdating([mod])}
        />
      ))}
    </ul>
  )

  return (
    <div className="split:h-full split:min-h-0 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Browse {noun}</h1>
          <p className="text-muted-foreground text-sm">{describeFilters(data?.filters, noun)}</p>
        </div>
        <Tabs
          value={state.provider}
          onValueChange={(v) => {
            const provider = Provider.safeParse(v)
            // Categories differ per platform, so the filter starts over.
            if (provider.success) update({ provider: provider.data, category: undefined })
          }}
        >
          <TabsList>
            {Provider.options.map((p) => (
              <TabsTrigger key={p} value={p}>
                <ProviderLogo provider={p} className="size-3.5" />
                {providerLabel[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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

      {cfRef && (
        <Link
          {...projectLink(`/project/curseforge/${cfRef}`, location)}
          className="bg-card hover:border-foreground/20 flex items-center gap-3 rounded-xl border p-4 transition-colors"
        >
          <ProviderLogo provider="curseforge" className="size-5 text-[#F16436]" />
          <span className="flex-1">
            Open CurseForge project <span className="font-medium">{cfRef}</span>
          </span>
          <ArrowRightIcon className="text-muted-foreground size-4" />
        </Link>
      )}

      {needsKey ? (
        <PageMessage
          icon={KeyRoundIcon}
          title="CurseForge needs an API key"
          action={
            <Button asChild>
              <Link to="/settings">Add a key in Settings</Link>
            </Button>
          }
        >
          CurseForge only lets apps search it with a key. You can create one for free and add it in
          Settings; it stays on this computer.
        </PageMessage>
      ) : search.isPending ? (
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
        <PageMessage icon={SearchXIcon} title={`No ${noun} found`}>
          {state.all ? 'Try other words.' : 'Try other words, or show incompatible ones too.'}
        </PageMessage>
      ) : (
        <>
          {split ? (
            <ScrollPanel viewportRef={results} className="min-h-0 flex-1">
              {hits}
            </ScrollPanel>
          ) : (
            hits
          )}
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
      <UpdateDialog mods={updating} onOpenChange={(o) => !o && setUpdating(null)} />
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
  location,
  installed,
  onInstall,
  onUpdate,
  categoryLabels,
}: {
  hit: ProjectHit
  location: { pathname: string; search: string }
  /** The installed jar of this project, if any. */
  installed: InstalledMod | undefined
  onInstall: () => void
  onUpdate: (mod: InstalledMod) => void
  categoryLabels: ReadonlyMap<string, string>
}) {
  // CurseForge slugs need an extra lookup (they're only unique per class), so link by id there.
  const path = `/project/${hit.provider}/${hit.provider === 'modrinth' ? hit.slug || hit.id : hit.id}`
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
    <li className="bg-card hover:border-foreground/20 h-36 relative flex items-stretch gap-4 rounded-xl border p-4 transition-colors">
      {/* Narrow lists (the split view) get a smaller icon and title, fewer stats and no author. */}
      <ProjectIcon
        url={hit.iconUrl}
        className="h-full size-auto aspect-square rounded-2xl @max-xl:size-20 @max-xl:rounded-xl"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            {...projectLink(path, location)}
            className="truncate text-lg font-semibold hover:underline after:absolute after:inset-0 @max-xl:text-base"
          >
            {hit.title}
          </Link>
          {hit.author && (
            <span className="text-muted-foreground shrink-0 text-sm @max-lg:hidden">
              by {hit.author}
            </span>
          )}
        </div>
        <p className="text-muted-foreground line-clamp-2 text-sm">{hit.description}</p>
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
      <div className="h-full text-muted-foreground text-sm flex shrink-0 flex-col items-end justify-between gap-2">
        <div className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1.5" title={`${hit.downloads} downloads`}>
            <DownloadIcon className="size-4" />
            {compactNumber(hit.downloads, true)}
          </span>
          {hit.follows !== undefined && (
            <span
              className="flex items-center gap-1.5 @max-xl:hidden"
              title={`${hit.follows} followers`}
            >
              <HeartIcon className="size-4" />
              {compactNumber(hit.follows)}
            </span>
          )}
          {hit.updatedAt && (
            <span
              className="flex items-center gap-1.5 @max-lg:hidden"
              title={`Updated ${shortDate(hit.updatedAt)}`}
            >
              <HistoryIcon className="size-4" />
              {timeAgo(hit.updatedAt, Date.now(), true)}
            </span>
          )}
        </div>
        {/* Above the card-wide link. */}
        <div className="relative z-10 mt-auto">
          {installed?.update ? (
            <Button variant="secondary" onClick={() => onUpdate(installed)}>
              <ArrowUpCircleIcon />
              Update
            </Button>
          ) : installed ? (
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
