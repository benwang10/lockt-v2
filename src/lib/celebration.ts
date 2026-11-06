import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Confetti bookkeeping: celebrate a study session at most once, after the
 * first CONFIRMED final save of its completion flow.
 *
 * Finishing the timer saves the session privately on the server, but that is
 * not the celebration moment; the user is still on the completion screen. The
 * celebration happens when the completion screen's save succeeds (whether the
 * user picks Followers or Only me). Retries, refreshes, reopening the post,
 * later edits and visibility changes never replay it, because the session id
 * is remembered here (also across app restarts).
 */
const KEY = 'studylog.celebratedSessions.v1';
const MAX_REMEMBERED = 100;

let memory: string[] | null = null;

async function load(): Promise<string[]> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    memory = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    memory = [];
  }
  return memory;
}

/**
 * Returns true exactly once per session id, and only for a successful save
 * in the completion flow. Marks the session before returning so concurrent
 * calls (double tap, re-render) can't both celebrate.
 */
let queue: Promise<unknown> = Promise.resolve();

export function claimCelebration(sessionId: string, ctx: { completionFlow: boolean; saved: boolean }): Promise<boolean> {
  if (!ctx.completionFlow || !ctx.saved) return Promise.resolve(false);
  // Serialised, so two claims racing through the first async load can't both win.
  const run = queue.then(async () => {
    const list = await load();
    if (list.includes(sessionId)) return false;
    memory = [...list, sessionId].slice(-MAX_REMEMBERED);
    AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => undefined);
    return true;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Test helper. */
export function __resetCelebrationMemory() {
  memory = null;
}
