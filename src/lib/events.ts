import { useSyncExternalStore } from 'react';

/**
 * Tiny invalidation bus: after a mutation (share, delete, follow…) bump a
 * topic; screens compare the version they last loaded with the current one
 * when they regain focus and refetch if it changed.
 */
export type Topic = 'sessions' | 'social' | 'subjects' | 'goals' | 'profile' | 'notifications' | 'status';

const versions: Record<Topic, number> = {
  sessions: 0,
  social: 0,
  subjects: 0,
  goals: 0,
  profile: 0,
  notifications: 0,
  status: 0,
};
const listeners = new Set<() => void>();

export function invalidate(...topics: Topic[]) {
  for (const t of topics) versions[t] += 1;
  listeners.forEach((l) => l());
}

export function getVersion(topic: Topic) {
  return versions[topic];
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTopicVersion(...topics: Topic[]): string {
  return useSyncExternalStore(
    subscribe,
    () => topics.map((t) => versions[t]).join('.'),
    () => topics.map((t) => versions[t]).join('.'),
  );
}

// ---------------------------------------------------------------------------
// Sessions that became unavailable (deleted, made private, unfollowed).
// Lists drop them immediately instead of waiting for a refetch.
// ---------------------------------------------------------------------------
const removedListeners = new Set<(sessionId: string) => void>();

export function announceSessionUnavailable(sessionId: string) {
  removedListeners.forEach((l) => l(sessionId));
}

export function onSessionUnavailable(listener: (sessionId: string) => void): () => void {
  removedListeners.add(listener);
  return () => {
    removedListeners.delete(listener);
  };
}
