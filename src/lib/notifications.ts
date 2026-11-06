import type { Href } from 'expo-router';

import type { AppNotification } from './types';

export type NotificationView = {
  /** Sentence after the actor's name, e.g. "liked your session". */
  action: string;
  /** Secondary line: post title, comment excerpt or an availability note. */
  detail: string | null;
  /** Where tapping goes. Never a target the reader can't see. */
  destination: Href;
  /** Invitation actions to offer inline. */
  invite: 'respond' | 'follow-to-accept' | null;
  /** The referenced content is gone or no longer visible. */
  stale: boolean;
};

const UNAVAILABLE = 'This session is no longer available.';

/**
 * Turns a notification into display text + a safe destination. The server
 * already nulls out sessions/excerpts the reader can't see; this only maps
 * what's left, so a stale notification degrades to the actor's profile and
 * can never navigate into an inaccessible post.
 */
export function presentNotification(n: AppNotification, opts: { followingActor?: boolean } = {}): NotificationView {
  const profile: Href = { pathname: '/user/[id]', params: { id: n.actor.id } };
  const session: Href | null = n.session_id ? { pathname: '/session/[id]', params: { id: n.session_id } } : null;
  const title = n.session_title ? `“${n.session_title}”` : null;
  switch (n.kind) {
    case 'follow':
      return { action: 'started following you', detail: null, destination: profile, invite: null, stale: false };
    case 'like':
      return {
        action: 'liked your session',
        detail: title ?? UNAVAILABLE,
        destination: session ?? profile,
        invite: null,
        stale: !session,
      };
    case 'comment':
      return {
        action: 'commented on your session',
        detail: session ? (n.comment_excerpt ? `“${n.comment_excerpt}”` : title) : UNAVAILABLE,
        destination: session ?? profile,
        invite: null,
        stale: !session,
      };
    case 'buddy_accepted':
      return {
        action: 'accepted your study-buddy invitation',
        detail: title ?? UNAVAILABLE,
        destination: session ?? profile,
        invite: null,
        stale: !session,
      };
    case 'buddy_invite': {
      const status = n.invite_status;
      if (status === 'pending') {
        const canRespond = !!session && opts.followingActor !== false;
        return {
          action: 'invited you to be a study buddy',
          detail: canRespond ? title : `Follow @${n.actor.username} to see the session and accept.`,
          destination: session ?? profile,
          invite: canRespond ? 'respond' : 'follow-to-accept',
          stale: false,
        };
      }
      if (status === 'accepted') {
        return {
          action: 'added you as a study buddy',
          detail: title ?? UNAVAILABLE,
          destination: session ?? profile,
          invite: null,
          stale: !session,
        };
      }
      if (status === 'declined') {
        return { action: 'invited you to be a study buddy', detail: 'You declined.', destination: profile, invite: null, stale: false };
      }
      return {
        action: 'invited you to be a study buddy',
        detail: 'This invitation is no longer available.',
        destination: profile,
        invite: null,
        stale: true,
      };
    }
    default:
      // Unknown kinds from a newer server: show something harmless.
      return { action: 'sent you an update', detail: null, destination: profile, invite: null, stale: false };
  }
}
