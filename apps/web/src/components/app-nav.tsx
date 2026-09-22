import { CompassIcon, type LucideIcon, PackageIcon, SettingsIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'

const links: { to: string; label: string; Icon: LucideIcon; end?: boolean; also?: string }[] = [
  { to: '/', label: 'Installed', Icon: PackageIcon, end: true },
  // Project pages are reached from Browse.
  { to: '/browse', label: 'Browse', Icon: CompassIcon, also: '/project/' },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

/** Main navigation: a sidebar on wide screens, a row of tabs above the content on narrow ones. */
export function AppNav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 gap-1 md:sticky md:top-24 md:w-44 md:flex-col md:self-start"
    >
      {links.map(({ to, label, Icon, end, also }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4',
              (isActive || (also && pathname.startsWith(also))) && 'bg-muted text-foreground',
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
