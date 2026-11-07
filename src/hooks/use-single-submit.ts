import { useRef } from 'react';

/**
 * Guards an async submit so it can't run twice at once. Unlike a `submitting`
 * state flag, the ref is updated synchronously, so two Enter key presses (or
 * a click plus Enter) in the same frame still produce a single request.
 */
export function useSingleSubmit<A extends unknown[]>(fn: (...args: A) => Promise<unknown>): (...args: A) => Promise<void> {
  const busy = useRef(false);
  return async (...args: A) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn(...args);
    } finally {
      busy.current = false;
    }
  };
}
