import { type Provider, providerLabel, type Side } from '@mc-mod/shared'
import {
  ArrowLeftRightIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  HardDriveIcon,
  type LucideIcon,
  MonitorIcon,
  ServerIcon,
} from 'lucide-react'
import type { ComponentProps } from 'react'
import { type SimpleIcon, siCurseforge, siModrinth } from 'simple-icons'
import { sideLabel } from '@/lib/mods'
import { cn } from '@/lib/utils'

const providerIcon: Record<Provider, SimpleIcon> = {
  modrinth: siModrinth,
  curseforge: siCurseforge,
}

/** Shared pill shape: solid colour, white text, so the column reads at a glance. */
const chip =
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap text-white shadow-xs [&_svg]:size-3.5 [&_svg]:shrink-0'

export function ProviderLogo({ provider, className }: { provider: Provider; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d={providerIcon[provider].path} />
    </svg>
  )
}

/**
 * Source pill in the provider's brand colour with its logo. `also` adds the second provider's logo
 * when the file is on both. Local files get a quiet grey pill so identified ones stand out.
 */
export function SourceChip({
  provider,
  also,
  local,
  className,
  ...props
}: ComponentProps<'span'> & { provider?: Provider; also?: Provider; local?: string }) {
  if (!provider) {
    return (
      <span
        className={cn(chip, 'bg-muted text-muted-foreground shadow-none', className)}
        {...props}
      >
        <HardDriveIcon />
        {local ?? 'Local'}
      </span>
    )
  }
  return (
    <span
      className={cn(chip, className)}
      style={{ backgroundColor: `#${providerIcon[provider].hex}` }}
      {...props}
    >
      <ProviderLogo provider={provider} />
      {providerLabel[provider]}
      {also && (
        <span
          className="-mr-1 flex size-4.5 items-center justify-center rounded-full"
          style={{ backgroundColor: `#${providerIcon[also].hex}` }}
          title={`Also on ${providerLabel[also]}`}
        >
          <ProviderLogo provider={also} className="size-3!" />
        </span>
      )}
    </span>
  )
}

const sideStyle: Record<Side, { Icon: LucideIcon; className: string }> = {
  client: { Icon: MonitorIcon, className: 'bg-sky-600 hover:bg-sky-700' },
  server: { Icon: ServerIcon, className: 'bg-violet-600 hover:bg-violet-700' },
  both: { Icon: ArrowLeftRightIcon, className: 'bg-teal-600 hover:bg-teal-700' },
  // Unknown needs a decision, so it gets the loudest colour (dark text for contrast on amber).
  unknown: { Icon: CircleHelpIcon, className: 'bg-amber-400 text-amber-950 hover:bg-amber-500' },
}

/** Side pill that doubles as the trigger of the side menu (pass it to `DropdownMenuTrigger asChild`). */
export function SideChip({ side, className, ...props }: ComponentProps<'button'> & { side: Side }) {
  const { Icon, className: color } = sideStyle[side]
  return (
    <button
      type="button"
      className={cn(
        chip,
        'focus-visible:ring-ring/50 transition-colors outline-none focus-visible:ring-3',
        color,
        className,
      )}
      {...props}
    >
      <Icon />
      {sideLabel[side]}
      <ChevronDownIcon className="-mr-1 opacity-80" />
    </button>
  )
}
