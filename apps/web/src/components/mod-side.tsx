import { type InstalledMod, providerLabel, type Side } from '@mc-mod/shared'
import { toast } from 'sonner'
import { SideChip, SideChipButton } from '@/components/mod-chips'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUpdateMod } from '@/hooks/use-mods'
import { errorMessage } from '@/lib/api'
import { primary, sideLabel } from '@/lib/mods'

const SIDES: Side[] = ['client', 'server', 'both']

const sideSourceLabel = {
  override: 'set by you',
  platform: 'from the platform',
  jar: 'from the jar',
  unknown: 'unknown',
} as const

/**
 * A mod's side: a read-only chip when the platform says it (D19), otherwise a chip that opens a menu
 * to set it, saved as a side override.
 */
export function ModSide({ mod, className }: { mod: InstalledMod; className?: string }) {
  const update = useUpdateMod()
  const main = primary(mod)

  if (mod.sideSource === 'platform' && main) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <SideChip side={mod.side} className={className} />
        </TooltipTrigger>
        <TooltipContent>
          From {providerLabel[main.provider]}. Treat as local to set it yourself.
        </TooltipContent>
      </Tooltip>
    )
  }

  const set = (sideOverride: Side | null) =>
    update.mutate(
      { fileName: mod.fileName, body: { sideOverride } },
      { onError: (err) => toast.error(errorMessage(err)) },
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SideChipButton
          side={mod.side}
          aria-label={`Side: ${sideLabel[mod.side]}. Change side`}
          className={className}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Side: {sideSourceLabel[mod.sideSource]}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mod.sideSource === 'override' ? mod.side : 'auto'}
          onValueChange={(v) => set(v === 'auto' ? null : (SIDES.find((s) => s === v) ?? null))}
        >
          <DropdownMenuRadioItem value="auto">Automatic</DropdownMenuRadioItem>
          {SIDES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {sideLabel[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
