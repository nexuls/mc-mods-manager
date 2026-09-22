import { createContext, type RefObject, useContext } from 'react'

/** The element the page scrolls in: App's ScrollPanel below the header. The window itself doesn't scroll. */
export const PageScrollContext = createContext<RefObject<HTMLDivElement | null>>({ current: null })

export function usePageScroll() {
  return useContext(PageScrollContext)
}
