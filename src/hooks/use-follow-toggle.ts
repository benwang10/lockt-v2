import { useCallback, useRef, useState } from 'react';

import { followUser, unfollowUser } from '@/lib/api/profiles';
import { friendlyError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import type { ProfileSummary } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useToast } from '@/providers/toast';

/** Optimistic follow/unfollow for lists (search results, follower lists). */
export function useFollowToggle(followingIds: Set<string> | undefined, setFollowingIds: (next: Set<string>) => void) {
  const { userId } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const inflight = useRef(new Set<string>());

  const toggle = useCallback(
    async (user: ProfileSummary) => {
      if (!userId || !followingIds || inflight.current.has(user.id)) return;
      inflight.current.add(user.id);
      setBusy(new Set(inflight.current));
      const wasFollowing = followingIds.has(user.id);
      const optimistic = new Set(followingIds);
      if (wasFollowing) optimistic.delete(user.id);
      else optimistic.add(user.id);
      setFollowingIds(optimistic);
      try {
        if (wasFollowing) await unfollowUser(userId, user.id);
        else await followUser(userId, user.id);
        invalidate('social');
      } catch (e) {
        setFollowingIds(followingIds);
        toast(friendlyError(e), 'error');
      } finally {
        inflight.current.delete(user.id);
        setBusy(new Set(inflight.current));
      }
    },
    [userId, followingIds, setFollowingIds, toast],
  );

  return { toggle, busy };
}
