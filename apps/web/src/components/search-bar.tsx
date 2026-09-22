import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent)

/** Inputs where `/` should type a slash rather than jump to the search bar. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * The large search field. Ctrl+K / ⌘K (or `/` outside other inputs) focuses it from anywhere on the page;
 * Escape clears it, and a second Escape leaves it. Enter calls `onSubmit`, e.g. to skip a debounce.
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  busy = false,
  autoFocus = false,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder: string
  label: string
  /** Shows a spinner in place of the search icon. */
  busy?: boolean
  autoFocus?: boolean
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(autoFocus)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const modK = e.key.toLowerCase() === 'k' && (isMac ? e.metaKey : e.ctrlKey) && !e.altKey
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)
      if (!modK && !slash) return
      e.preventDefault()
      input.current?.focus()
      input.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const clear = () => {
    onChange('')
    input.current?.focus()
  }

  return (
    <InputGroup
      className={cn(
        'bg-card h-12 rounded-xl shadow-xs has-[[data-slot=input-group-control]:focus-visible]:ring-4',
        className,
      )}
    >
      <InputGroupAddon className="pl-4">
        {busy ? <Loader2Icon className="size-5 animate-spin" /> : <SearchIcon className="size-5" />}
      </InputGroupAddon>
      <InputGroupInput
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit?.()
          if (e.key !== 'Escape') return
          // Instead of the browser's own Escape on type=search: clear first, then leave the field.
          e.preventDefault()
          if (value) onChange('')
          else e.currentTarget.blur()
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts={isMac ? 'Meta+K /' : 'Control+K /'}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        // Hide the browser's own clear button; ours is below.
        className="h-full text-base! [&::-webkit-search-cancel-button]:appearance-none"
      />
      <InputGroupAddon align="inline-end" className="pr-3">
        {value ? (
          <InputGroupButton
            size="icon-sm"
            className="rounded-lg"
            aria-label="Clear search"
            title="Clear (Esc)"
            onClick={clear}
          >
            <XIcon className="size-4.5" />
          </InputGroupButton>
        ) : (
          !focused && (
            <KbdGroup className="hidden sm:inline-flex">
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          )
        )}
      </InputGroupAddon>
    </InputGroup>
  )
}
