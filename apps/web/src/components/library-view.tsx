import { type ContentKind, contentDirName, Provider, providerLabel } from '@mc-mod/shared'
import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate, useSearchParams } from 'react-router'
import { BrowseView } from '@/components/browse-view'
import { InstalledView } from '@/components/installed-view'
import { ProjectView } from '@/components/project-view'
import { SearchBar } from '@/components/search-bar'
import { useMediaQuery } from '@/hooks/use-media-query'
import { parseBrowseParams, projectOrigin, toBrowseParams } from '@/lib/browse'
import { cn } from '@/lib/utils'

const SEARCH_DEBOUNCE_MS = 300
/**
 * Tailwind's `xl`. From here up both lists show side by side, and the `xl:` classes in InstalledView and
 * BrowseView give each its own scrolling list.
 */
const SPLIT_QUERY = '(min-width: 80rem)'

/**
 * Layout route for `/`, `/browse` and `/project/:provider/:id`, so it stays mounted between them: Installed and
 * Browse behind one search bar, side by side on wide screens (the route picks one otherwise). A project opens
 * over the Browse list, which stays mounted underneath, so its page and scroll position survive.
 * The text filters the installed list as you type and searches the catalog after a pause; it lives in
 * the URL (`?q=`), so it carries over between the routes.
 */
export function LibraryView({ contentKind }: { contentKind: ContentKind }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const projectMatch = useMatch('/project/:provider/:id')
  const onBrowse = useMatch('/browse') !== null
  const projectProvider = Provider.safeParse(projectMatch?.params.provider)
  const project =
    projectProvider.success && projectMatch?.params.id
      ? { provider: projectProvider.data, id: projectMatch.params.id, path: projectMatch.pathname }
      : null
  const pane = onBrowse || projectMatch ? 'browse' : 'installed'
  // The list the open project returns to; the Browse params stay in the URL meanwhile.
  const origin = projectOrigin(location.state)
  const state = parseBrowseParams(params)
  const contentLabel = contentDirName[contentKind]

  // The input updates right away; the URL (and the catalog search) follows after a pause in typing.
  const [text, setText] = useState(state.q)
  const pushed = useRef(state.q)
  const push = (q: string) => {
    pushed.current = q
    const next = toBrowseParams({ ...state, q, page: 0 })
    // Searching from an open project goes back to the results.
    if (projectMatch) navigate({ pathname: origin, search: `?${next}` })
    else setParams(next, { replace: true })
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the typed text should trigger this
  useEffect(() => {
    const q = text.trim()
    if (q === state.q) return
    const t = setTimeout(() => push(q), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text])
  // Back/forward changes the URL without typing; follow it, but not our own debounced updates.
  useEffect(() => {
    if (state.q !== pushed.current) {
      pushed.current = state.q
      setText(state.q)
    }
  }, [state.q])

  const searching = useIsFetching({ queryKey: ['search'] }) > 0
  const waiting = text.trim() !== state.q
  const split = useMediaQuery(SPLIT_QUERY)
  const browsing = split || pane === 'browse'
  const provider = providerLabel[state.provider]
  const [placeholder, label] = split
    ? [`Search installed ${contentLabel} and ${provider}`, `Search ${contentLabel}`]
    : browsing
      ? [`Search ${contentLabel} on ${provider}`, `Search ${contentLabel}`]
      : [`Filter ${contentLabel}`, `Filter ${contentLabel}`]

  // Below the split the page itself scrolls: remember where the list was, and return there on Back.
  const listScroll = useRef(0)
  useEffect(() => {
    if (project) return
    const onScroll = () => {
      listScroll.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [project])
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a project opens, changes or closes
  useLayoutEffect(() => {
    if (!split) window.scrollTo({ top: project ? 0 : listScroll.current })
  }, [project?.path])

  const installed = <InstalledView contentLabel={contentLabel} text={text} />
  const browse = (
    // The project covers the list in the split (the list keeps its own scroll) and replaces it below.
    <div className="relative xl:h-full">
      <div className={cn('xl:h-full', project && 'max-xl:hidden xl:invisible')}>
        <BrowseView contentKind={contentKind} />
      </div>
      {project && (
        <div className="bg-background xl:absolute xl:inset-0 xl:overflow-y-auto">
          <ProjectView
            key={project.path}
            provider={project.provider}
            id={project.id}
            back={{ pathname: origin, search: location.search }}
          />
        </div>
      )}
    </div>
  )

  return (
    // Split: fill the viewport below the header (4rem) and the page padding (2 × 2rem).
    <div className="flex flex-col gap-6 xl:h-[calc(100svh-8.2rem)]">
      <SearchBar
        value={text}
        onChange={setText}
        onSubmit={() => text.trim() !== state.q && push(text.trim())}
        placeholder={placeholder}
        label={label}
        busy={browsing && (searching || waiting)}
        autoFocus={onBrowse}
      />
      {split ? (
        // Installed gets more room; Browse keeps enough for its cards.
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(26rem,4fr)] gap-8">
          <section aria-label={`Installed ${contentLabel}`} className="@container min-h-0">
            {installed}
          </section>
          <section aria-label={`Browse ${contentLabel}`} className="@container min-h-0">
            {browse}
          </section>
        </div>
      ) : (
        <div className="@container">{pane === 'browse' ? browse : installed}</div>
      )}
    </div>
  )
}
