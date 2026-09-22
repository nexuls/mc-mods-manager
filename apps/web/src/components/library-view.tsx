import { type ContentKind, contentDirName, providerLabel } from '@mc-mod/shared'
import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { BrowseView } from '@/components/browse-view'
import { InstalledView } from '@/components/installed-view'
import { SearchBar } from '@/components/search-bar'
import { useMediaQuery } from '@/hooks/use-media-query'
import { parseBrowseParams, toBrowseParams } from '@/lib/browse'

const SEARCH_DEBOUNCE_MS = 300
/**
 * Tailwind's `xl`. From here up both lists show side by side, and the `xl:` classes in InstalledView and
 * BrowseView give each its own scrolling list.
 */
const SPLIT_QUERY = '(min-width: 80rem)'

/**
 * Installed and Browse behind one search bar, side by side on wide screens (`pane` picks one otherwise).
 * The text filters the installed list as you type and searches the catalog after a pause; it lives in
 * the URL (`?q=`), so it carries over between the two.
 */
export function LibraryView({
  contentKind,
  pane,
}: {
  contentKind: ContentKind
  pane: 'installed' | 'browse'
}) {
  const [params, setParams] = useSearchParams()
  const state = parseBrowseParams(params)
  const contentLabel = contentDirName[contentKind]

  // The input updates right away; the URL (and the catalog search) follows after a pause in typing.
  const [text, setText] = useState(state.q)
  const pushed = useRef(state.q)
  const push = (q: string) => {
    pushed.current = q
    setParams(toBrowseParams({ ...state, q, page: 0 }), { replace: true })
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

  const installed = <InstalledView contentLabel={contentLabel} text={text} />
  const browse = <BrowseView contentKind={contentKind} />

  return (
    // Split: fill the viewport below the header (4rem) and the page padding (2 × 2rem).
    <div className="flex flex-col gap-6 xl:h-[calc(100svh-8rem)]">
      <SearchBar
        value={text}
        onChange={setText}
        onSubmit={() => text.trim() !== state.q && push(text.trim())}
        placeholder={placeholder}
        label={label}
        busy={browsing && (searching || waiting)}
        autoFocus={pane === 'browse'}
      />
      {split ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-8">
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
