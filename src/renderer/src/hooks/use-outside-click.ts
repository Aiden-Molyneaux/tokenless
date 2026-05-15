import { useEffect, useRef, type RefObject } from 'react'

// Attaches a mousedown listener on document. When the user clicks outside
// the ref's element, calls `onOutside`. No-op when `enabled` is false.
// Use the returned ref on the element whose interior clicks should NOT
// trigger close (e.g. the popover host).
export function useOutsideClick<T extends HTMLElement>(enabled: boolean, onOutside: () => void): RefObject<T> {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!enabled) return undefined
    const handler = (e: MouseEvent): void => {
      const el = ref.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [enabled, onOutside])
  return ref
}
