import {
  type InstalledMod,
  type Provider,
  providerLabel,
  type Side,
  type UpdateModBody,
} from '@mc-mod/shared'
import {
  AlertTriangleIcon,
  ArrowUpCircleIcon,
  ExternalLinkIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PackageIcon,
  RepeatIcon,
  Trash2Icon,
  UnlinkIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SideChip, SideChipButton, SourceChip } from '@/components/mod-chips'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRemoveMod, useUpdateMod } from '@/hooks/use-mods'
import { errorMessage } from '@/lib/api'
import {
  displayName,
  displayVersion,
  methodLabel,
  primary,
  projectUrl,
  sideLabel,
} from '@/lib/mods'
import { cn } from '@/lib/utils'

const SIDES: Side[] = ['client', 'server', 'both']

/** Badge labels in the name cell: hidden (icon only) while the cell is narrower than 24rem. */
const BADGE_TEXT = '@max-sm/name:hidden'

const sideSourceLabel = {
  override: 'set by you',
  platform: 'from the platform',
  jar: 'from the jar',
  unknown: 'unknown',
} as const

export function ModRow({
  mod,
  onLink,
  onUpdate,
  onChangeVersion,
}: {
  mod: InstalledMod
  onLink: () => void
  onUpdate: () => void
  onChangeVersion: () => void
}) {
  const update = useUpdateMod()
  const remove = useRemoveMod()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const main = primary(mod)
  const other = mod.sources.find((s) => s !== main)
  const name = displayName(mod)
  const version = displayVersion(mod)

  const patch = (body: UpdateModBody, done?: string) =>
    update.mutate(
      { fileName: mod.fileName, body },
      {
        onSuccess: () => done && toast.success(done),
        onError: (err) => toast.error(errorMessage(err)),
      },
    )

  return (
    <TableRow className={cn(!mod.enabled && 'text-muted-foreground')}>
      <TableCell className="w-16 min-w-16 p-2!">
        {main?.iconUrl ? (
          <img
            src={main.iconUrl}
            alt=""
            loading="lazy"
            className={cn('size-12 rounded-md', !mod.enabled && 'opacity-50 grayscale')}
          />
        ) : (
          <div className="bg-muted flex size-8 items-center justify-center rounded-md">
            <PackageIcon className="text-muted-foreground size-4" />
          </div>
        )}
      </TableCell>

      <TableCell className="max-w-0 min-w-48">
        {/* A narrow cell shows the badges as icons (the tooltips still say what they are), so the name keeps room. */}
        <div className="@container/name flex items-center gap-1.5 *:data-[slot=badge]:shrink-0">
          <span className="min-w-0 truncate font-medium" title={name}>
            {name}
          </span>
          {(mod.compatibility === 'wrong-loader' || mod.compatibility === 'wrong-game-version') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" aria-label="Incompatible">
                  <AlertTriangleIcon />
                  <span className={BADGE_TEXT}>Incompatible</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {mod.compatibilityReason ?? 'Not made for this instance'}
              </TooltipContent>
            </Tooltip>
          )}
          {mod.update && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  asChild
                  variant="secondary"
                  className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                >
                  <button
                    type="button"
                    onClick={onUpdate}
                    aria-label={`Update ${name}`}
                    className="cursor-pointer"
                  >
                    <ArrowUpCircleIcon />
                    <span className={BADGE_TEXT}>Update</span>
                  </button>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {mod.update.manual
                  ? `Update to ${mod.update.versionNumber}: download it from ${providerLabel[mod.update.provider]}`
                  : `Update to ${mod.update.versionNumber}`}
              </TooltipContent>
            </Tooltip>
          )}
          {mod.conflict && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" aria-label="Link conflict">
                  <UnlinkIcon />
                  <span className={BADGE_TEXT}>Link conflict</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Your manual link points elsewhere, but the exact file belongs to this project.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="text-muted-foreground truncate text-xs" title={mod.fileName}>
          {/* The Version column is hidden in narrow tables. */}
          {version && <span className="@3xl:hidden">{version} · </span>}
          {mod.fileName}
        </div>
      </TableCell>

      <TableCell className="text-muted-foreground max-w-32 truncate text-sm @max-3xl:hidden">
        {version ?? '—'}
      </TableCell>

      <TableCell>
        {main ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SourceChip
                provider={main.provider}
                also={other?.provider}
                className={cn(!mod.enabled && 'opacity-60')}
              />
            </TooltipTrigger>
            <TooltipContent>
              {methodLabel[main.method]}
              {other && `. Also on ${providerLabel[other.provider]}.`}
            </TooltipContent>
          </Tooltip>
        ) : (
          <SourceChip local={mod.unlinked ? 'Local (by you)' : 'Local'} />
        )}
      </TableCell>

      <TableCell className="@max-2xl:hidden">
        {mod.sideSource === 'platform' && main ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SideChip side={mod.side} className={cn(!mod.enabled && 'opacity-60')} />
            </TooltipTrigger>
            <TooltipContent>
              From {providerLabel[main.provider]}. Treat as local to set it yourself.
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SideChipButton
                side={mod.side}
                aria-label={`Side: ${sideLabel[mod.side]}. Change side`}
                className={cn(!mod.enabled && 'opacity-60')}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                Side: {sideSourceLabel[mod.sideSource]}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={mod.sideSource === 'override' ? mod.side : 'auto'}
                onValueChange={(v) =>
                  patch({ sideOverride: v === 'auto' ? null : SIDES.find((s) => s === v) })
                }
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
        )}
      </TableCell>

      <TableCell>
        <Switch
          checked={mod.enabled}
          disabled={update.isPending}
          aria-label={mod.enabled ? `Disable ${name}` : `Enable ${name}`}
          onCheckedChange={(enabled) => patch({ enabled })}
        />
      </TableCell>

      <TableCell className="w-16">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="end">
            {mod.sources.map((s) => (
              <DropdownMenuItem key={s.provider} asChild>
                <a href={projectUrl(s)} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  Open on {providerLabel[s.provider]}
                </a>
              </DropdownMenuItem>
            ))}
            {mod.sources.length > 1 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Updates from</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={mod.primaryPinned ? (mod.primarySource ?? 'auto') : 'auto'}
                    onValueChange={(v) =>
                      patch({
                        primarySource:
                          v === 'auto' ? null : mod.sources.find((s) => s.provider === v)?.provider,
                      })
                    }
                  >
                    <DropdownMenuRadioItem value="auto">Preferred provider</DropdownMenuRadioItem>
                    {mod.sources.map((s) => (
                      <DropdownMenuRadioItem key={s.provider} value={s.provider satisfies Provider}>
                        {providerLabel[s.provider]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {mod.sources.length > 0 && <DropdownMenuSeparator />}
            {mod.update && (
              <DropdownMenuItem onSelect={onUpdate}>
                <ArrowUpCircleIcon />
                Update to {mod.update.versionNumber}
              </DropdownMenuItem>
            )}
            {mod.sources.length > 0 && (
              <DropdownMenuItem onSelect={onChangeVersion}>
                <RepeatIcon />
                Change version…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onLink}>
              <LinkIcon />
              Link to project…
            </DropdownMenuItem>
            {mod.unlinked ? (
              <DropdownMenuItem onSelect={() => patch({ unlinked: false }, 'Identifying again')}>
                <LinkIcon />
                Identify automatically
              </DropdownMenuItem>
            ) : (
              mod.sources.length > 0 && (
                <DropdownMenuItem
                  onSelect={() => patch({ unlinked: true }, `${name} is now local`)}
                >
                  <UnlinkIcon />
                  Treat as local
                </DropdownMenuItem>
              )
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
              <Trash2Icon />
              Remove…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
              <AlertDialogDescription className="break-all">
                {mod.fileName} is moved to .mc-mod/trash in the instance folder, so you can still
                get it back from there.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  remove.mutate(mod.fileName, {
                    onSuccess: (r) => toast.success(`Moved ${r.fileName} to ${r.trashPath}`),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}
