import { router, type Href } from 'expo-router';

/**
 * Leaves the current screen without ever dispatching an unhandled GO_BACK.
 *
 * `router.back()` throws a development error ("The action 'GO_BACK' was not
 * handled by any navigator") when there is no history, which happens when a
 * screen was opened from a link, a notification, after a browser reload or
 * as the first screen of the app. In that case we replace the route with a
 * safe fallback (Feed by default) instead of trying to go back.
 *
 * Repeated taps within a short window are ignored so a double tap can't pop
 * two screens or bounce between routes.
 */
let lastLeaveAt = 0;
const LEAVE_DEBOUNCE_MS = 600;

export function goBackOr(fallback: Href = '/feed'): 'back' | 'replace' | 'ignored' {
  const now = Date.now();
  if (now - lastLeaveAt < LEAVE_DEBOUNCE_MS) return 'ignored';
  lastLeaveAt = now;
  try {
    if (router.canGoBack()) {
      router.back();
      return 'back';
    }
  } catch {
    // Fall through to the fallback route.
  }
  router.replace(fallback);
  return 'replace';
}

/** Test helper: forget the debounce between test cases. */
export function __resetNavigationDebounce() {
  lastLeaveAt = 0;
}
