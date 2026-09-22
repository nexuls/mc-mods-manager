import { CompassIcon, type LucideIcon, PackageIcon, SettingsIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'

const links: {
  to: string
  label: string
  Icon: LucideIcon
  end?: boolean
  also?: string
  library?: boolean
}[] = [
  { to: '/', label: 'Installed', Icon: PackageIcon, end: true, library: true },
  // Project pages are reached from Browse.
  { to: '/browse', label: 'Browse', Icon: CompassIcon, also: '/project/', library: true },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

/** Main navigation: a sidebar on wide screens, a row of tabs above the content on narrow ones. */
export function AppNav() {
  const { pathname, search } = useLocation()
  // Installed and Browse share the search bar, so moving between them keeps the query.
  const inLibrary = links.some((l) => l.library && l.to === pathname)
  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 gap-1 md:sticky md:top-24 md:w-44 md:flex-col md:self-start"
    >
      {links.map(({ to, label, Icon, end, also, library }) => (
        <NavLink
          key={to}
          to={library && inLibrary ? { pathname: to, search } : to}
          end={end}
          className={({ isActive }) =>
            cn(
              'text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4',
              (isActive || (also && pathname.startsWith(also))) && 'bg-muted text-foreground',
              // Wide screens show Installed and Browse together.
              library && inLibrary && 'xl:bg-muted xl:text-foreground',
            )
          }
        >
          <Icon />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
