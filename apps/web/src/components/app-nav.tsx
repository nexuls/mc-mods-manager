import { CompassIcon, type LucideIcon, PackageIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'

const links: { to: string; label: string; Icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Installed', Icon: PackageIcon, end: true },
  { to: '/browse', label: 'Browse', Icon: CompassIcon },
]

/** Main navigation: a sidebar on wide screens, a row of tabs above the content on narrow ones. */
export function AppNav() {
  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 gap-1 md:sticky md:top-24 md:w-44 md:flex-col md:self-start"
    >
      {links.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4',
              isActive && 'bg-muted text-foreground',
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
