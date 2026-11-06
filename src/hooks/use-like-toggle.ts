import { useCallback, useRef } from 'react';

import { likeSession, unlikeSession } from '@/lib/api/social';
import { friendlyError, isAccessDenied } from '@/lib/errors';
import { announceSessionUnavailable } from '@/lib/events';
import type { SessionCardData } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useToast } from '@/providers/toast';

/**
 * Optimistic like/unlike. Ignores taps while a request for the same session is
 * in flight, and rolls back + explains if the server rejects or is unreachable.
 */
export function useLikeToggle(
  updateItem: (id: string, patch: (s: SessionCardData) => SessionCardData) => void,
  onAccessLost?: (sessionId: string) => void,
) {
  const { userId } = useAuth();
  const toast = useToast();
  const inflight = useRef(new Set<string>());

  return useCallback(
    async (session: SessionCardData) => {
      if (!userId || inflight.current.has(session.id)) return;
      inflight.current.add(session.id);
      const like = !session.liked_by_me;
      const apply = (liked: boolean, delta: number) =>
        updateItem(session.id, (s) => ({ ...s, liked_by_me: liked, like_count: Math.max(0, s.like_count + delta) }));
      apply(like, like ? 1 : -1);
      try {
        if (like) await likeSession(session.id, userId);
        else await unlikeSession(session.id, userId);
      } catch (e) {
        apply(!like, like ? -1 : 1);
        if (isAccessDenied(e)) {
          // The session was made private, deleted, or we unfollowed: it is gone for us.
          toast('This session is no longer available.', 'info');
          announceSessionUnavailable(session.id);
          onAccessLost?.(session.id);
        } else {
          toast(`${like ? "Couldn't like" : "Couldn't unlike"} — ${friendlyError(e)}`, 'error');
        }
      } finally {
        inflight.current.delete(session.id);
      }
    },
    [userId, updateItem, onAccessLost, toast],
  );
}
