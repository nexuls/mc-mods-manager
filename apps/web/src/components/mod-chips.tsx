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
import type { ComponentProps, CSSProperties } from 'react'
import { type SimpleIcon, siCurseforge, siModrinth } from 'simple-icons'
import { sideLabel } from '@/lib/mods'
import { cn } from '@/lib/utils'

const providerIcon: Record<Provider, SimpleIcon> = {
  modrinth: siModrinth,
  curseforge: siCurseforge,
}

/**
 * Shared pill shape, tinted by `--chip`: a translucent wash and border of the colour, the icon in the
 * colour itself, and plain foreground text so it matches the monochrome theme.
 */
const chip =
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-(--chip)/30 bg-(--chip)/12 px-2.5 text-xs font-medium whitespace-nowrap text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-(--chip)'

const tint = (color: string): CSSProperties => ({ '--chip': color }) as CSSProperties

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
      <span className={cn(chip, className)} style={tint('var(--muted-foreground)')} {...props}>
        <HardDriveIcon />
        {local ?? 'Local'}
      </span>
    )
  }
  return (
    <span className={cn(chip, className)} style={tint(`#${providerIcon[provider].hex}`)} {...props}>
      <ProviderLogo provider={provider} />
      {providerLabel[provider]}
      {also && (
        <span
          className="-mr-1 border-(--chip)/30 flex items-center border-l pl-1.5"
          style={tint(`#${providerIcon[also].hex}`)}
          title={`Also on ${providerLabel[also]}`}
        >
          <ProviderLogo provider={also} />
        </span>
      )}
    </span>
  )
}

const sideStyle: Record<Side, { Icon: LucideIcon; color: string }> = {
  client: { Icon: MonitorIcon, color: 'var(--color-sky-500)' },
  // sRGB violet: Tailwind v4's violet-500 is out of gamut and its tinted border fringes yellow.
  server: { Icon: ServerIcon, color: '#8b5cf6' },
  both: { Icon: ArrowLeftRightIcon, color: 'var(--color-teal-500)' },
  // Unknown needs a decision, so it gets the warmest colour.
  unknown: { Icon: CircleHelpIcon, color: 'var(--color-amber-500)' },
}

/** Read-only side pill, for sides that come from the platform. */
export function SideChip({ side, className, ...props }: ComponentProps<'span'> & { side: Side }) {
  const { Icon, color } = sideStyle[side]
  return (
    <span className={cn(chip, className)} style={tint(color)} {...props}>
      <Icon />
      {sideLabel[side]}
    </span>
  )
}

/** Side pill that doubles as the trigger of the side menu (pass it to `DropdownMenuTrigger asChild`). */
export function SideChipButton({
  side,
  className,
  ...props
}: ComponentProps<'button'> & { side: Side }) {
  const { Icon, color } = sideStyle[side]
  return (
    <button
      type="button"
      className={cn(
        chip,
        'focus-visible:ring-ring/50 transition-colors outline-none hover:bg-(--chip)/20 focus-visible:ring-3 aria-expanded:bg-(--chip)/20',
        className,
      )}
      style={tint(color)}
      {...props}
    >
      <Icon />
      {sideLabel[side]}
      <ChevronDownIcon className="-mr-1 opacity-70" />
    </button>
  )
}
