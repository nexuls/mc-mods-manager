import { startTransition, useEffect, useState } from 'react'
import { z } from 'zod'
import { useMediaQuery } from '@/hooks/use-media-query'

/** Tailwind's `xl`: from here up Installed and Browse can show side by side. */
const SPLIT_QUERY = '(min-width: 80rem)'

// Whether the user wants the split, remembered in this browser. On unless turned off.
const KEY = 'mc-mod.split'
const Stored = z.enum(['on', 'off'])

function read(): boolean {
  try {
    return Stored.catch('on').parse(localStorage.getItem(KEY)) === 'on'
  } catch {
    // Storage can be disabled.
    return true
  }
}

let preferred = read()
const listeners = new Set<(on: boolean) => void>()

function setPreferred(on: boolean) {
  preferred = on
  try {
    localStorage.setItem(KEY, Stored.parse(on ? 'on' : 'off'))
  } catch {
    // Then it only lasts for this page load.
  }
  for (const l of listeners) l(on)
}

/**
 * `split`: Installed and Browse are side by side right now (a wide screen and the user wants it).
 * `available`: the screen is wide enough to offer the toggle.
 *
 * Every caller mirrors the shared preference in its own state, rather than `useSyncExternalStore`,
 * because store reads are always urgent: this way `setWanted` can update them inside a React
 * transition, which is what lets `<ViewTransition>` animate the layout change like a navigation.
 */
export function useSplitView() {
  const available = useMediaQuery(SPLIT_QUERY)
  const [wanted, setWanted] = useState(preferred)
  useEffect(() => {
    // A mount between the change and this effect would otherwise keep the value it read.
    setWanted(preferred)
    listeners.add(setWanted)
    return () => {
      listeners.delete(setWanted)
    }
  }, [])
  return {
    split: available && wanted,
    available,
    wanted,
    setWanted: (on: boolean) => startTransition(() => setPreferred(on)),
  }
}
