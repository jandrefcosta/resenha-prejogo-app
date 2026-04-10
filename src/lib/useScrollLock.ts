import { useEffect } from 'react';

/**
 * Locks document.body scroll while the calling component is mounted (or while `active` is true).
 * Restores the previous overflow value on cleanup so nested modals compose correctly.
 *
 * Usage in a modal that is only rendered when open:
 *   useScrollLock();                // always active — unmount = unlock
 *
 * Usage in a component that controls its own visibility:
 *   useScrollLock(isOpen);          // active when isOpen, inactive otherwise
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
