import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { timerApi, type TimerResult } from '@/lib/api/sessions';
import { errorCode, friendlyError, isNetworkError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import { randomId } from '@/lib/ids';
import { activeElapsedMs, serverNowFromDevice } from '@/lib/timer';
import type { StudySession } from '@/lib/types';
import { useAuth } from '@/providers/auth';

/**
 * Owns the user's single active study session.
 *
 * Source of truth is the server row (timestamps + accumulated active time).
 * A local cache lets the timer render instantly after an app restart or while
 * offline, but every transition goes through an idempotent RPC, and the cache
 * is reconciled with the server on launch and whenever the app is foregrounded.
 *
 * If an action fails because the network is down, we keep it as `pending`
 * (persisted) together with the moment the user tapped, so a retry records
 * the intended pause/finish time and nothing is silently lost.
 */

export type ActionKind = 'start' | 'pause' | 'resume' | 'finish' | 'discard';

export type PendingAction =
  | { kind: 'start'; id: string; subjectId: string; intention: string | null; goalId: string | null }
  | { kind: 'pause'; at: string }
  | { kind: 'resume' }
  | { kind: 'finish'; at: string }
  | { kind: 'discard' };

type Persisted = {
  session: StudySession | null;
  offsetMs: number;
  pending: PendingAction | null;
};

type ContextValue = {
  session: StudySession | null;
  /** Local cache has been read. */
  hydrated: boolean;
  /** State has been confirmed with the server since launch / last foreground. */
  synced: boolean;
  syncing: boolean;
  syncError: string | null;
  busy: ActionKind | null;
  pending: PendingAction | null;
  actionError: string | null;
  notice: string | null;
  elapsedMs: (deviceNowMs?: number) => number;
  refresh: () => Promise<void>;
  start: (args: { subjectId: string; intention: string | null; goalId: string | null }) => Promise<boolean>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<StudySession | null>;
  discard: () => Promise<boolean>;
  retryPending: () => Promise<StudySession | null | void>;
  dismissPending: () => void;
  clearMessages: () => void;
};

const ActiveSessionContext = createContext<ContextValue | null>(null);

export function useActiveSession(): ContextValue {
  const ctx = useContext(ActiveSessionContext);
  if (!ctx) throw new Error('useActiveSession must be used inside ActiveSessionProvider');
  return ctx;
}

const storageKey = (userId: string) => `studylog.activeSession.v1.${userId}`;

/** Remounts the provider per account so no state can leak between users. */
export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  return (
    <UserActiveSessionProvider key={userId ?? 'signed-out'} userId={userId}>
      {children}
    </UserActiveSessionProvider>
  );
}

function UserActiveSessionProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [session, setSession] = useState<StudySession | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);
  // Latest state for async callbacks; every state write goes through apply()
  // or hydration, which keep this in sync.
  const stateRef = useRef<Persisted>({ session: null, offsetMs: 0, pending: null });

  // ---- persistence -------------------------------------------------------
  const persist = useCallback(
    (next: Persisted) => {
      if (!userId) return;
      AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => undefined);
    },
    [userId],
  );

  const apply = useCallback(
    (next: Partial<Persisted>) => {
      const merged = { ...stateRef.current, ...next };
      stateRef.current = merged;
      if ('session' in next) setSession(merged.session);
      if ('offsetMs' in next) setOffsetMs(merged.offsetMs);
      if ('pending' in next) setPending(merged.pending);
      persist(merged);
    },
    [persist],
  );

  const applyResult = useCallback(
    (result: TimerResult, extra: Partial<Persisted> = {}) => {
      apply({ session: result.session, offsetMs: result.offsetMs, ...extra });
      setSynced(true);
      setSyncError(null);
    },
    [apply],
  );

  // ---- server reconciliation ----------------------------------------------
  const refresh = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    try {
      const result = await timerApi.getActive();
      const prev = stateRef.current;
      let nextPending = prev.pending;
      if (prev.pending?.kind === 'start' && result.session?.id === prev.pending.id) nextPending = null;
      if (prev.pending && prev.pending.kind !== 'start' && !result.session) nextPending = null;
      if (prev.pending?.kind === 'finish' && !result.session) {
        // The finish reached the server even though its response was lost.
        setNotice('Your finished session was saved privately. You can add details from Progress.');
        invalidate('sessions', 'goals');
      } else if (prev.session && !result.session && !prev.pending) {
        setNotice('Your session was finished or discarded on another device.');
        invalidate('sessions');
      } else if (prev.session && result.session && prev.session.id !== result.session.id) {
        setNotice('A different session is running on another device. Showing it here.');
      }
      applyResult(result, { pending: nextPending });
    } catch (e) {
      setSyncError(friendlyError(e));
    } finally {
      setSyncing(false);
    }
  }, [userId, applyResult]);

  // Hydrate from the local cache, then reconcile with the server.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (cancelled || !raw) return;
        const cached = JSON.parse(raw) as Persisted;
        stateRef.current = cached;
        setSession(cached.session);
        setOffsetMs(cached.offsetMs ?? 0);
        setPending(cached.pending ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setHydrated(true);
        refresh();
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  // Re-sync when returning to the foreground (another device may have acted).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // ---- actions --------------------------------------------------------------
  const serverNowIso = useCallback(
    () => new Date(serverNowFromDevice(Date.now(), stateRef.current.offsetMs)).toISOString(),
    [],
  );

  /** Runs one action at a time; maps conflicts and network failures. */
  const runAction = useCallback(
    async <T,>(kind: ActionKind, pendingIfOffline: PendingAction | null, fn: () => Promise<T>): Promise<T | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(kind);
      setActionError(null);
      setNotice(null);
      try {
        return await fn();
      } catch (e) {
        if (isNetworkError(e) && pendingIfOffline) {
          apply({ pending: pendingIfOffline });
          setActionError(friendlyError(e));
        } else {
          const code = errorCode(e);
          setActionError(friendlyError(e));
          if (code === 'session_not_found' || code === 'session_not_active' || code === 'active_session_exists') {
            // Another device changed the session: show the server's truth.
            apply({ pending: null });
            await refresh();
          }
        }
        return null;
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [apply, refresh],
  );

  const start = useCallback(
    async (args: { subjectId: string; intention: string | null; goalId: string | null }) => {
      const prev = stateRef.current.pending;
      // Reuse the id of a failed attempt so a retry can never create a duplicate.
      const id = prev?.kind === 'start' && prev.subjectId === args.subjectId ? prev.id : randomId();
      const intent: PendingAction = { kind: 'start', id, ...args };
      const result = await runAction('start', intent, async () => {
        const r = await timerApi.start({ id, ...args });
        applyResult(r, { pending: null });
        return r;
      });
      return !!result?.session;
    },
    [runAction, applyResult],
  );

  const pause = useCallback(async () => {
    const s = stateRef.current.session;
    if (!s) return;
    const prev = stateRef.current.pending;
    const at = prev?.kind === 'pause' ? prev.at : serverNowIso();
    await runAction('pause', { kind: 'pause', at }, async () => {
      applyResult(await timerApi.pause(s.id, at), { pending: null });
    });
  }, [runAction, applyResult, serverNowIso]);

  const resume = useCallback(async () => {
    const s = stateRef.current.session;
    if (!s) return;
    await runAction('resume', { kind: 'resume' }, async () => {
      applyResult(await timerApi.resume(s.id), { pending: null });
    });
  }, [runAction, applyResult]);

  const finish = useCallback(async (): Promise<StudySession | null> => {
    const s = stateRef.current.session;
    if (!s) return null;
    const prev = stateRef.current.pending;
    const at = prev?.kind === 'finish' ? prev.at : serverNowIso();
    return runAction('finish', { kind: 'finish', at }, async () => {
      const r = await timerApi.finish(s.id, at);
      apply({ session: null, offsetMs: r.offsetMs, pending: null });
      setSynced(true);
      invalidate('sessions', 'goals');
      return r.session;
    });
  }, [runAction, apply, serverNowIso]);

  const discard = useCallback(async () => {
    const s = stateRef.current.session;
    if (!s) return false;
    const ok = await runAction('discard', { kind: 'discard' }, async () => {
      await timerApi.discard(s.id);
      apply({ session: null, pending: null });
      return true;
    });
    return !!ok;
  }, [runAction, apply]);

  const retryPending = useCallback(async () => {
    const p = stateRef.current.pending;
    if (!p) return;
    switch (p.kind) {
      case 'start':
        await start({ subjectId: p.subjectId, intention: p.intention, goalId: p.goalId });
        return;
      case 'pause':
        return pause();
      case 'resume':
        return resume();
      case 'finish':
        return finish();
      case 'discard':
        await discard();
        return;
    }
  }, [start, pause, resume, finish, discard]);

  const value = useMemo<ContextValue>(
    () => ({
      session,
      hydrated,
      synced,
      syncing,
      syncError,
      busy,
      pending,
      actionError,
      notice,
      elapsedMs: (deviceNowMs = Date.now()) =>
        session ? activeElapsedMs(session, serverNowFromDevice(deviceNowMs, offsetMs)) : 0,
      refresh,
      start,
      pause,
      resume,
      finish,
      discard,
      retryPending,
      dismissPending: () => {
        apply({ pending: null });
        setActionError(null);
      },
      clearMessages: () => {
        setActionError(null);
        setNotice(null);
      },
    }),
    [session, hydrated, synced, syncing, syncError, busy, pending, actionError, notice, offsetMs, refresh, start, pause, resume, finish, discard, retryPending, apply],
  );

  return <ActiveSessionContext.Provider value={value}>{children}</ActiveSessionContext.Provider>;
}

/** Re-render every `intervalMs` while enabled (display only — never a source of truth). */
export function useNow(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [enabled, intervalMs]);
  return now;
}
