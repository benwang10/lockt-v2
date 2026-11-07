/**
 * Turn Supabase / network errors into honest, user-facing messages and flag
 * whether a retry might help.
 */

type MaybeError = { message?: string; code?: string; status?: number; name?: string } | null | undefined;

const KNOWN: Record<string, string> = {
  not_authenticated: 'Your session expired. Please sign in again.',
  subject_not_found: 'That subject no longer exists. Pick another one.',
  goal_not_found: 'That goal no longer exists.',
  active_session_exists: 'You already have a session running (maybe on another device).',
  session_not_found: 'This session no longer exists — it may have been discarded on another device.',
  session_not_active: 'This session was already finished, possibly on another device.',
  session_already_completed: 'This session was already finished and saved.',
  intention_too_long: 'Your intention is too long.',
  feedback_empty: 'Write a few words first.',
  feedback_too_long: 'Feedback can be at most 2,000 characters.',
  feedback_invalid_category: 'Choose Bug, Suggestion or Other.',
  feedback_rate_limited: 'You’ve sent a lot of feedback in the last hour. Please try again a bit later.',
};

export function isNetworkError(error: unknown): boolean {
  const e = error as MaybeError;
  const msg = (e?.message ?? String(error ?? '')).toLowerCase();
  return (
    e?.name === 'AuthRetryableFetchError' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('load failed')
  );
}

/**
 * True when the database refused a request because the caller can no longer
 * see the row (RLS), e.g. liking/commenting on a session that just became
 * private or after unfollowing.
 */
export function isAccessDenied(error: unknown): boolean {
  const e = error as MaybeError;
  return e?.code === '42501' || /row-level security/i.test(e?.message ?? '');
}

export function errorCode(error: unknown): string | null {
  const e = error as MaybeError;
  const msg = e?.message?.trim();
  if (msg && msg in KNOWN) return msg;
  return null;
}

export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (isNetworkError(error)) return "Can't reach the server. Check your connection and try again.";
  const code = errorCode(error);
  if (code) return KNOWN[code];
  const e = error as MaybeError;
  if (e?.code === '23505') return 'That already exists.';
  if (e?.code === '42501') return "You don't have permission to do that.";
  if (e?.code === '23514') return 'Some details are invalid. Please check and try again.';
  if (e?.message && e.message.length < 160) return e.message;
  return fallback;
}
