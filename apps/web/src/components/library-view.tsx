import { type ContentKind, contentDirName, providerLabel } from '@mc-mod/shared'
import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { BrowseView } from '@/components/browse-view'
import { InstalledView } from '@/components/installed-view'
import { SearchBar } from '@/components/search-bar'
import { parseBrowseParams, toBrowseParams } from '@/lib/browse'

const SEARCH_DEBOUNCE_MS = 300

/**
 * Installed and Browse behind one search bar. The text filters the installed list as you type and
 * searches the catalog after a pause; it lives in the URL (`?q=`), so it carries over between the two.
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
  const browsing = pane === 'browse'
  const provider = providerLabel[state.provider]

  return (
    <div className="flex flex-col gap-6">
      <SearchBar
        value={text}
        onChange={setText}
        onSubmit={() => text.trim() !== state.q && push(text.trim())}
        placeholder={browsing ? `Search ${contentLabel} on ${provider}` : `Filter ${contentLabel}`}
        label={browsing ? `Search ${contentLabel}` : `Filter ${contentLabel}`}
        busy={browsing && (searching || waiting)}
        autoFocus={browsing}
      />
      {browsing ? (
        <BrowseView contentKind={contentKind} />
      ) : (
        <InstalledView contentLabel={contentLabel} text={text} />
      )}
    </div>
  )
}
