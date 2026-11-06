import { presentNotification } from '../notifications';
import type { AppNotification } from '../types';

const actor = { id: 'u-a', username: 'ada', display_name: 'Ada', avatar_path: null };
function n(partial: Partial<AppNotification>): AppNotification {
  return {
    id: 'n1',
    kind: 'like',
    created_at: '2026-11-04T10:00:00Z',
    read_at: null,
    actor,
    session_id: 's1',
    session_title: 'Organic chem review',
    comment_excerpt: null,
    invite_id: null,
    invite_status: null,
    ...partial,
  };
}
const toProfile = { pathname: '/user/[id]', params: { id: 'u-a' } };
const toSession = { pathname: '/session/[id]', params: { id: 's1' } };

describe('notification presentation and destinations', () => {
  test('follow → actor profile', () => {
    expect(presentNotification(n({ kind: 'follow', session_id: null, session_title: null }))).toMatchObject({
      action: 'started following you',
      destination: toProfile,
    });
  });

  test('like / comment → the session, with excerpt', () => {
    expect(presentNotification(n({ kind: 'like' }))).toMatchObject({ destination: toSession, detail: '“Organic chem review”' });
    expect(presentNotification(n({ kind: 'comment', comment_excerpt: 'So proud of you' }))).toMatchObject({
      destination: toSession,
      detail: '“So proud of you”',
    });
  });

  test('stale targets never link to the post and never show old content', () => {
    for (const kind of ['like', 'comment', 'buddy_accepted'] as const) {
      const view = presentNotification(n({ kind, session_id: null, session_title: null, comment_excerpt: null }));
      expect(view.destination).toEqual(toProfile);
      expect(view.stale).toBe(true);
      expect(view.detail).toBe('This session is no longer available.');
    }
  });

  test('pending invitation: respond inline when the session is visible', () => {
    expect(presentNotification(n({ kind: 'buddy_invite', invite_id: 'i1', invite_status: 'pending' }))).toMatchObject({
      invite: 'respond',
      destination: toSession,
    });
  });

  test('pending invitation from someone you do not follow: follow first, no post details', () => {
    const view = presentNotification(n({ kind: 'buddy_invite', invite_id: 'i1', invite_status: 'pending', session_id: null, session_title: null }));
    expect(view).toMatchObject({ invite: 'follow-to-accept', destination: toProfile });
    expect(view.detail).toMatch(/Follow @ada/);
  });

  test('revoked or removed invitations are neutral and link only to the profile', () => {
    for (const status of ['revoked', null] as const) {
      const view = presentNotification(n({ kind: 'buddy_invite', invite_id: status ? 'i1' : null, invite_status: status, session_id: null, session_title: null }));
      expect(view).toMatchObject({ invite: null, stale: true, destination: toProfile });
    }
  });

  test('unknown kinds from a newer server degrade safely', () => {
    expect(presentNotification(n({ kind: 'mystery' as never })).destination).toEqual(toProfile);
  });
});
