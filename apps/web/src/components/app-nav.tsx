import type { ContentKind } from '@mc-mod/shared'
import { CompassIcon, type LucideIcon, PackageIcon, ServerIcon, SettingsIcon } from 'lucide-react'
import { ViewTransition } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useSplitView } from '@/hooks/use-split-view'
import { cn } from '@/lib/utils'

const links: {
  to: string
  label: string
  Icon: LucideIcon
  end?: boolean
  also?: string
  library?: boolean
  /** Only for mod instances: plugins are server-only already. */
  modsOnly?: boolean
}[] = [
  { to: '/', label: 'Installed', Icon: PackageIcon, end: true, library: true },
  // Project pages are reached from Browse.
  { to: '/browse', label: 'Browse', Icon: CompassIcon, also: '/project/', library: true },
  { to: '/export', label: 'Export', Icon: ServerIcon, modsOnly: true },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

/** What `NavLink` marks active, plus the pages a link stands in for (`also`), as a plain check. */
function isCurrent(pathname: string, to: string, end?: boolean, also?: string) {
  const onPath = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  return onPath || (also !== undefined && pathname.startsWith(also))
}

/** Main navigation: a sidebar on wide screens, a row of tabs above the content on narrow ones. */
export function AppNav({ contentKind }: { contentKind: ContentKind }) {
  const { pathname, search } = useLocation()
  const { split } = useSplitView()
  // Installed and Browse share the search bar, so moving between them keeps the query.
  const inLibrary =
    pathname.startsWith('/project/') || links.some((l) => l.library && l.to === pathname)
  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 gap-1 max-md:-mx-6 max-md:overflow-x-auto max-md:px-6 md:sticky md:top-8 md:w-44 md:flex-col md:self-start"
    >
      {links
        .filter((l) => !l.modsOnly || contentKind === 'mod')
        .map(({ to, label, Icon, end, also, library }) => {
          const current = isCurrent(pathname, to, end, also)
          // The split view shows Installed and Browse together, so both look picked.
          const highlighted = current || Boolean(library && inLibrary && split)
          return (
            <NavLink
              key={to}
              to={library && inLibrary ? { pathname: to, search } : to}
              end={end}
              className={cn(
                'text-muted-foreground hover:bg-muted hover:text-foreground relative isolate flex shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4',
                highlighted && 'text-foreground',
              )}
            >
              {/*
               * The highlight behind the current item is its own element, named so React moves it:
               * it leaves the old item and enters the new one in the same transition, which the
               * browser animates as one shape sliding across. The item merely kept alongside it in
               * the split view is left out, so the name stays on a single element.
               */}
              {current ? (
                <ViewTransition name="nav-highlight">
                  <span aria-hidden className="bg-muted absolute inset-0 -z-10 rounded-lg" />
                </ViewTransition>
              ) : (
                highlighted && (
                  <span aria-hidden className="bg-muted absolute inset-0 -z-10 rounded-lg" />
                )
              )}
              {/*
               * The label rides above the highlight: during a transition every snapshot is painted
               * over the rest of the page, so the icon and text need one of their own (kept still
               * by the `nav-label` class in index.css) for the highlight to slide behind them.
               */}
              <ViewTransition default="nav-label">
                <span className="flex items-center gap-2.5">
                  <Icon />
                  {label}
                </span>
              </ViewTransition>
            </NavLink>
          )
        })}
    </nav>
  )
}
