/**
 * Study buddies, notifications, profile statuses and the profile highlight
 * statistic, exercised exactly as PostgREST would run them (role
 * authenticated + JWT claims), so RLS, grants and RPC checks are real.
 */
import {
  asAdmin,
  asAnon,
  asUser,
  closePool,
  completeSession,
  createSubject,
  createUser,
  follow,
  randomUUID,
  rpc,
  shareSession,
  unfollow,
  type TestUser,
} from './helpers';

afterAll(closePool);

/** Monday-start week containing now, in UTC (any 168 h range is accepted). */
function weekRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return { p_week_start: start.toISOString(), p_week_end: end.toISOString() };
}

/** Calls an RPC that returns a table row (PostgREST returns it as a JSON object). */
async function rpcRow(userId: string, fn: string, args: Record<string, unknown>): Promise<any> {
  const names = Object.keys(args);
  const placeholders = names.map((n, i) => n + ' => $' + (i + 1)).join(', ');
  const { rows } = await asUser(userId, (c) => c.query('select * from public.' + fn + '(' + placeholders + ')', Object.values(args)));
  return rows[0];
}

async function notificationsFor(user: TestUser) {
  const { rows } = await asUser(user.id, (c) => c.query('select * from public.list_notifications(null, null, 50)'));
  return rows;
}

async function unreadCount(user: TestUser): Promise<number> {
  const { rows } = await asUser(user.id, (c) =>
    c.query('select count(*)::int as n from public.notifications where read_at is null'),
  );
  return rows[0].n;
}

async function buddiesVisibleTo(user: TestUser, sessionId: string) {
  const { rows } = await asUser(user.id, (c) =>
    c.query('select id, buddy_id, status from public.study_buddies where session_id = $1 order by created_at', [sessionId]),
  );
  return rows;
}

async function canSeeSession(user: TestUser, sessionId: string) {
  const { rows } = await asUser(user.id, (c) => c.query('select id from public.study_sessions where id = $1', [sessionId]));
  return rows.length === 1;
}

// ===========================================================================
// Profile statuses
// ===========================================================================
describe('profile statuses', () => {
  let owner: TestUser;
  let follower: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    owner = await createUser('st_owner');
    follower = await createUser('st_fol');
    stranger = await createUser('st_str');
    await follow(follower.id, owner.id);
  });

  async function statusSeenBy(viewer: TestUser) {
    const { rows } = await asUser(viewer.id, (c) =>
      c.query('select emoji, body from public.profile_statuses where user_id = $1', [owner.id]),
    );
    return rows[0] ?? null;
  }

  test('owner sets a status with emoji + note; it expires 24 h after saving (server clock)', async () => {
    const row = await rpcRow(owner.id, 'set_status', { p_emoji: '📚', p_body: '  Finals week, send snacks  ' });
    expect(row.body).toBe('Finals week, send snacks');
    const hours = (Date.parse(row.expires_at) - Date.parse(row.updated_at)) / 3_600_000;
    expect(hours).toBeCloseTo(24, 5);
    expect(await statusSeenBy(owner)).toEqual({ emoji: '📚', body: 'Finals week, send snacks' });
  });

  test('one active status per user: saving again replaces it and restarts the 24 h', async () => {
    await asAdmin((c) =>
      c.query("update public.profile_statuses set updated_at = now() - interval '20 hours', expires_at = now() + interval '4 hours' where user_id = $1", [owner.id]),
    );
    const row = await rpcRow(owner.id, 'set_status', { p_emoji: null, p_body: 'Library, 3rd floor' });
    expect((Date.parse(row.expires_at) - Date.now()) / 3_600_000).toBeGreaterThan(23.9);
    const { rows } = await asAdmin((c) => c.query('select count(*)::int as n from public.profile_statuses where user_id = $1', [owner.id]));
    expect(rows[0].n).toBe(1);
  });

  test('followers can read it; non-followers (even after finding them in search) cannot', async () => {
    expect(await statusSeenBy(follower)).toEqual({ emoji: null, body: 'Library, 3rd floor' });
    const { rows: found } = await asUser(stranger.id, (c) =>
      c.query('select id from public.search_profiles($1)', [owner.username]),
    );
    expect(found.map((r) => r.id)).toContain(owner.id);
    expect(await statusSeenBy(stranger)).toBeNull();
    await expect(asAnon((c) => c.query('select * from public.profile_statuses'))).rejects.toThrow(/permission denied/);
  });

  test('100 characters max (code points, so emoji count once); empty is rejected', async () => {
    await expect(rpcRow(owner.id, 'set_status', { p_emoji: null, p_body: 'x'.repeat(101) })).rejects.toThrow(/status_too_long/);
    await expect(rpcRow(owner.id, 'set_status', { p_emoji: '  ', p_body: '   ' })).rejects.toThrow(/status_empty/);
    const hundred = '🙂' + 'y'.repeat(99);
    await expect(rpcRow(owner.id, 'set_status', { p_emoji: null, p_body: hundred })).resolves.toMatchObject({ body: hundred });
    await expect(rpcRow(owner.id, 'set_status', { p_emoji: 'abc', p_body: 'hi' })).rejects.toThrow(/profile_statuses_emoji_format/);
  });

  test('users can only write their own status, and only through the RPCs', async () => {
    await expect(
      asUser(stranger.id, (c) => c.query("insert into public.profile_statuses (user_id, body) values ($1, 'hijack')", [owner.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(owner.id, (c) => c.query("update public.profile_statuses set expires_at = now() + interval '30 days' where user_id = $1", [owner.id])),
    ).rejects.toThrow(/permission denied/);
    await rpc(stranger.id, 'clear_status', {}); // clears only the caller's own
    expect(await statusSeenBy(owner)).not.toBeNull();
  });

  test('expired statuses disappear from every query, including the owner’s', async () => {
    await asAdmin((c) =>
      c.query("update public.profile_statuses set updated_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where user_id = $1", [owner.id]),
    );
    expect(await statusSeenBy(owner)).toBeNull();
    expect(await statusSeenBy(follower)).toBeNull();
  });

  test('unfollowing removes access; clearing removes the status', async () => {
    await rpcRow(owner.id, 'set_status', { p_emoji: '☕', p_body: 'Back in 10' });
    await unfollow(follower.id, owner.id);
    expect(await statusSeenBy(follower)).toBeNull();
    await follow(follower.id, owner.id);
    expect(await statusSeenBy(follower)).not.toBeNull();
    await rpc(owner.id, 'clear_status', {});
    expect(await statusSeenBy(owner)).toBeNull();
  });
});

// ===========================================================================
// Profile highlight statistic
// ===========================================================================
describe('profile highlight statistic', () => {
  let owner: TestUser;
  let follower: TestUser;
  let stranger: TestUser;
  let shared: Record<string, any>;
  let priv: Record<string, any>;

  beforeAll(async () => {
    owner = await createUser('hl_owner');
    follower = await createUser('hl_fol');
    stranger = await createUser('hl_str');
    await follow(follower.id, owner.id);
    const subject = await createSubject(owner.id, 'Physics', '#0B84C6');
    shared = await completeSession(owner.id, subject, 3600);
    priv = await completeSession(owner.id, subject, 1800);
    await shareSession(owner.id, shared.id, 'followers');
  });

  async function highlight(viewer: TestUser, kind?: string) {
    if (kind) {
      await asUser(owner.id, (c) => c.query('update public.profiles set highlight_stat = $2 where id = $1', [owner.id, kind]));
    }
    return rpc(viewer.id, 'get_profile_highlight', { p_user_id: owner.id, ...weekRange() });
  }

  test('defaults to hours this week for existing and new profiles', async () => {
    const { rows } = await asUser(owner.id, (c) => c.query('select highlight_stat from public.profiles where id = $1', [owner.id]));
    expect(rows[0].highlight_stat).toBe('hours_week');
  });

  test('owner: hours and sessions include private sessions', async () => {
    const hours = await highlight(owner, 'hours_week');
    expect(hours).toMatchObject({ kind: 'hours_week', scope: 'all' });
    expect(Number(hours.value)).toBe(shared.duration_seconds + priv.duration_seconds);
    expect(Number((await highlight(owner, 'sessions_week')).value)).toBe(2);
    expect(Number((await highlight(owner, 'hours_lifetime')).value)).toBe(shared.duration_seconds + priv.duration_seconds);
  });

  test('follower: only sessions currently shared with them; private activity never leaks', async () => {
    expect(await highlight(follower, 'hours_week')).toMatchObject({ scope: 'shared', value: shared.duration_seconds });
    expect(Number((await highlight(follower, 'sessions_week')).value)).toBe(1);
    expect(Number((await highlight(follower, 'hours_lifetime')).value)).toBe(shared.duration_seconds);
    await shareSession(owner.id, shared.id, 'private');
    expect(Number((await highlight(follower, 'hours_week')).value)).toBe(0);
    await shareSession(owner.id, shared.id, 'followers');
  });

  test('non-followers receive nothing', async () => {
    expect(await highlight(stranger, 'hours_week')).toBeNull();
    expect(await highlight(stranger, 'hours_lifetime')).toBeNull();
  });

  test('wins: explicit milestone completions this week, visible only to the owner', async () => {
    const { rows } = await asUser(owner.id, (c) =>
      c.query(
        `insert into public.goals (user_id, kind, title)
         values ($1, 'milestone', 'Finish lab report'), ($1, 'milestone', 'Read chapter 4'), ($1, 'milestone', 'Not done yet')
         returning id`,
        [owner.id],
      ),
    );
    await asUser(owner.id, (c) =>
      c.query('update public.goals set completed_at = now() where id = any($1)', [[rows[0].id, rows[1].id]]),
    );
    // A completion from last month is not this week's win.
    await asAdmin((c) => c.query("update public.goals set completed_at = now() - interval '40 days' where id = $1", [rows[1].id]));
    // Time-based goals never count, even if met.
    await asUser(owner.id, (c) =>
      c.query("insert into public.goals (user_id, kind, title, weekly_target_minutes) values ($1, 'weekly_time', 'Hours', 15)", [owner.id]),
    );
    expect(await highlight(owner, 'wins_week')).toMatchObject({ kind: 'wins_week', value: 1 });
    expect(await highlight(follower, 'wins_week')).toBeNull();
  });

  test('hidden shows nothing to anyone; bogus ranges are rejected', async () => {
    expect(await highlight(owner, 'hidden')).toBeNull();
    expect(await highlight(follower, 'hidden')).toBeNull();
    await expect(
      rpc(owner.id, 'get_profile_highlight', {
        p_user_id: owner.id,
        p_week_start: '2020-01-01T00:00:00Z',
        p_week_end: '2030-01-01T00:00:00Z',
      }),
    ).rejects.toThrow(/invalid_week_range/);
  });

  test('only the owner can change the selected statistic', async () => {
    const res = await asUser(stranger.id, (c) =>
      c.query("update public.profiles set highlight_stat = 'hidden' where id = $1", [owner.id]),
    );
    expect(res.rowCount).toBe(0);
  });
});

// ===========================================================================
// Notifications
// ===========================================================================
describe('notifications', () => {
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let session: Record<string, any>;

  beforeAll(async () => {
    a = await createUser('nt_a');
    b = await createUser('nt_b');
    c = await createUser('nt_c');
    const subject = await createSubject(a.id, 'History', '#C77700');
    session = await completeSession(a.id, subject, 1500);
    await shareSession(a.id, session.id, 'followers');
  });

  test('follow → "followed you"; unfollow removes it; refollow does not duplicate', async () => {
    await follow(b.id, a.id);
    let items = await notificationsFor(a);
    expect(items.filter((n) => n.kind === 'follow' && n.actor.id === b.id)).toHaveLength(1);
    await unfollow(b.id, a.id);
    items = await notificationsFor(a);
    expect(items.filter((n) => n.kind === 'follow')).toHaveLength(0);
    await follow(b.id, a.id);
    expect((await notificationsFor(a)).filter((n) => n.kind === 'follow')).toHaveLength(1);
  });

  test('like and comment notify the owner with a link and excerpt; retries never duplicate', async () => {
    await asUser(b.id, (cl) => cl.query('insert into public.likes (session_id, user_id) values ($1, $2)', [session.id, b.id]));
    await expect(
      asUser(b.id, (cl) => cl.query('insert into public.likes (session_id, user_id) values ($1, $2)', [session.id, b.id])),
    ).rejects.toThrow(/duplicate key/);
    const commentId = randomUUID();
    await asUser(b.id, (cl) =>
      cl.query('insert into public.comments (id, session_id, user_id, body) values ($1, $2, $3, $4)', [commentId, session.id, b.id, 'Great focus today!']),
    );
    await expect(
      asUser(b.id, (cl) =>
        cl.query('insert into public.comments (id, session_id, user_id, body) values ($1, $2, $3, $4)', [commentId, session.id, b.id, 'Great focus today!']),
      ),
    ).rejects.toThrow(/duplicate key/);
    const items = await notificationsFor(a);
    const like = items.filter((n) => n.kind === 'like');
    const comment = items.filter((n) => n.kind === 'comment');
    expect(like).toHaveLength(1);
    expect(like[0]).toMatchObject({ session_id: session.id, actor: expect.objectContaining({ id: b.id }) });
    expect(comment).toHaveLength(1);
    expect(comment[0]).toMatchObject({ session_id: session.id, comment_excerpt: 'Great focus today!' });
  });

  test('no notifications for your own likes and comments', async () => {
    const before = (await notificationsFor(a)).length;
    await asUser(a.id, (cl) => cl.query('insert into public.likes (session_id, user_id) values ($1, $2)', [session.id, a.id]));
    await asUser(a.id, (cl) =>
      cl.query('insert into public.comments (session_id, user_id, body) values ($1, $2, $3)', [session.id, a.id, 'note to self']),
    );
    expect((await notificationsFor(a)).length).toBe(before);
  });

  test('newest first with keyset pagination', async () => {
    const all = await notificationsFor(a);
    const times = all.map((n) => Date.parse(n.created_at));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    const { rows: page1 } = await asUser(a.id, (cl) => cl.query('select * from public.list_notifications(null, null, 2)'));
    const last = page1[page1.length - 1];
    const { rows: page2 } = await asUser(a.id, (cl) =>
      cl.query('select * from public.list_notifications($1, $2, 2)', [last.created_at, last.id]),
    );
    const ids = [...page1, ...page2].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(all.slice(0, ids.length).map((n) => n.id));
  });

  test('only the recipient can read them; clients cannot create or reassign notifications', async () => {
    const { rows } = await asUser(c.id, (cl) => cl.query('select * from public.notifications where recipient_id = $1', [a.id]));
    expect(rows).toEqual([]);
    expect(await notificationsFor(c)).toEqual([]);
    await expect(
      asUser(c.id, (cl) =>
        cl.query("insert into public.notifications (recipient_id, actor_id, kind, dedupe_key) values ($1, $2, 'follow', 'x')", [a.id, c.id]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(a.id, (cl) => cl.query('update public.notifications set actor_id = $1', [c.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(c.id, (cl) => cl.query("select public.notify($1, $2, 'follow', 'spoof')", [a.id, c.id]))).rejects.toThrow(
      /permission denied/,
    );
    const marked = await asUser(c.id, (cl) => cl.query('update public.notifications set read_at = now() where recipient_id = $1', [a.id]));
    expect(marked.rowCount).toBe(0);
  });

  test('read / unread state and mark all as read', async () => {
    expect(await unreadCount(a)).toBeGreaterThan(0);
    const [first] = await notificationsFor(a);
    await asUser(a.id, (cl) => cl.query('update public.notifications set read_at = now() where id = $1', [first.id]));
    const n = await rpc(a.id, 'mark_all_notifications_read', {});
    expect(n).toBeGreaterThan(0);
    expect(await unreadCount(a)).toBe(0);
    expect((await notificationsFor(a)).every((x) => x.read_at !== null)).toBe(true);
  });

  test('stale targets: unlike, deleted comment and deleted session remove their notifications', async () => {
    await asUser(b.id, (cl) => cl.query('delete from public.likes where session_id = $1 and user_id = $2', [session.id, b.id]));
    expect((await notificationsFor(a)).filter((n) => n.kind === 'like')).toHaveLength(0);
    await asUser(b.id, (cl) => cl.query('delete from public.comments where user_id = $1', [b.id]));
    expect((await notificationsFor(a)).filter((n) => n.kind === 'comment')).toHaveLength(0);

    const subject = await createSubject(a.id, 'Temp', '#5B5BD6');
    const doomed = await completeSession(a.id, subject, 600);
    await shareSession(a.id, doomed.id, 'followers');
    await asUser(b.id, (cl) => cl.query('insert into public.likes (session_id, user_id) values ($1, $2)', [doomed.id, b.id]));
    expect((await notificationsFor(a)).some((n) => n.session_id === doomed.id)).toBe(true);
    await asUser(a.id, (cl) => cl.query('delete from public.study_sessions where id = $1', [doomed.id]));
    const { rows } = await asAdmin((cl) => cl.query('select count(*)::int as n from public.notifications where session_id = $1', [doomed.id]));
    expect(rows[0].n).toBe(0);
  });
});

// ===========================================================================
// Study buddies
// ===========================================================================
describe('study buddies', () => {
  let owner: TestUser;
  let buddy: TestUser;
  let other: TestUser;
  let viewer: TestUser;
  let subject: string;
  let session: Record<string, any>;

  beforeAll(async () => {
    owner = await createUser('bd_owner');
    buddy = await createUser('bd_buddy');
    other = await createUser('bd_other');
    viewer = await createUser('bd_view');
    await follow(viewer.id, owner.id);
    subject = await createSubject(owner.id, 'Chemistry', '#0E8C8C');
    session = await completeSession(owner.id, subject, 2700);
  });

  const invite = (by: TestUser, sessionId: string, ids: string[]) =>
    rpc(by.id, 'invite_study_buddies', { p_session_id: sessionId, p_buddy_ids: ids });
  const respond = (by: TestUser, inviteId: string, accept: boolean) =>
    rpcRow(by.id, 'respond_study_buddy', { p_invite_id: inviteId, p_accept: accept });
  const remove = (by: TestUser, inviteId: string) => rpc(by.id, 'remove_study_buddy', { p_invite_id: inviteId });
  async function inviteRow(sessionId: string, buddyId: string) {
    const { rows } = await asAdmin((c) =>
      c.query('select * from public.study_buddies where session_id = $1 and buddy_id = $2', [sessionId, buddyId]),
    );
    return rows[0];
  }

  test('invitations require a followers-visible session owned by the caller', async () => {
    await expect(invite(owner, session.id, [buddy.id])).rejects.toThrow(/buddies_require_followers_visibility/);
    await shareSession(owner.id, session.id, 'followers');
    await expect(invite(other, session.id, [buddy.id])).rejects.toThrow(/session_not_found/);
    await expect(invite(owner, session.id, [owner.id])).rejects.toThrow(/cannot_invite_self/);
  });

  test('clients cannot write study_buddies directly', async () => {
    await expect(
      asUser(owner.id, (c) =>
        c.query("insert into public.study_buddies (session_id, owner_id, buddy_id, status) values ($1, $2, $3, 'accepted')", [
          session.id,
          owner.id,
          buddy.id,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  test('inviting is idempotent and notifies the invitee once', async () => {
    await invite(owner, session.id, [buddy.id, buddy.id]);
    await invite(owner, session.id, [buddy.id]);
    const { rows } = await asAdmin((c) => c.query('select count(*)::int as n from public.study_buddies where session_id = $1', [session.id]));
    expect(rows[0].n).toBe(1);
    const invites = (await notificationsFor(buddy)).filter((n) => n.kind === 'buddy_invite');
    expect(invites).toHaveLength(1);
    expect(invites[0].invite_status).toBe('pending');
  });

  test('a pending invitation never labels someone publicly and never grants access', async () => {
    expect(await buddiesVisibleTo(viewer, session.id)).toEqual([]);
    expect(await canSeeSession(buddy, session.id)).toBe(false);
    // The invitee (not following yet) sees who invited them, but nothing of the post.
    const [n] = (await notificationsFor(buddy)).filter((x) => x.kind === 'buddy_invite');
    expect(n).toMatchObject({ session_id: null, session_title: null, actor: expect.objectContaining({ id: owner.id }) });
  });

  test('accepting requires following the owner; then attribution is public and the owner is notified', async () => {
    const row = await inviteRow(session.id, buddy.id);
    await expect(respond(other, row.id, true)).rejects.toThrow(/invite_not_found/);
    await expect(respond(buddy, row.id, true)).rejects.toThrow(/buddy_requires_follow/);
    await follow(buddy.id, owner.id);
    const accepted = await respond(buddy, row.id, true);
    expect(accepted.status).toBe('accepted');
    await expect(respond(buddy, row.id, true)).resolves.toMatchObject({ status: 'accepted' }); // retry-safe
    expect((await buddiesVisibleTo(viewer, session.id)).map((r) => [r.buddy_id, r.status])).toEqual([[buddy.id, 'accepted']]);
    expect(await canSeeSession(buddy, session.id)).toBe(true);
    const ownerItems = (await notificationsFor(owner)).filter((n) => n.kind === 'buddy_accepted');
    expect(ownerItems).toHaveLength(1);
    expect(ownerItems[0]).toMatchObject({ session_id: session.id, invite_status: 'accepted' });
  });

  test('buddies get attribution only: no session, totals or authorship for them', async () => {
    const { rows } = await asAdmin((c) => c.query('select count(*)::int as n from public.study_sessions where user_id = $1', [buddy.id]));
    expect(rows[0].n).toBe(0);
    const res = await asUser(buddy.id, (c) => c.query("update public.study_sessions set title = 'mine now' where id = $1", [session.id]));
    expect(res.rowCount).toBe(0);
  });

  test('declined invitations are respected: no re-invite, and the owner can’t clear them to retry', async () => {
    await follow(other.id, owner.id);
    await invite(owner, session.id, [other.id]);
    const row = await inviteRow(session.id, other.id);
    await respond(other, row.id, false);
    await invite(owner, session.id, [other.id]);
    expect((await inviteRow(session.id, other.id)).status).toBe('declined');
    await expect(remove(owner, row.id)).rejects.toThrow(/invite_declined/);
    await expect(respond(other, row.id, true)).rejects.toThrow(/invite_no_longer_valid/);
  });

  test('switching to "Only me" hides the post from buddies and revokes pending invitations; re-sharing does not revive them', async () => {
    const pendingUser = await createUser('bd_pend');
    await follow(pendingUser.id, owner.id);
    await invite(owner, session.id, [pendingUser.id]);
    const pending = await inviteRow(session.id, pendingUser.id);

    await shareSession(owner.id, session.id, 'private');
    expect(await canSeeSession(buddy, session.id)).toBe(false);
    expect(await buddiesVisibleTo(viewer, session.id)).toEqual([]);
    expect((await inviteRow(session.id, pendingUser.id)).status).toBe('revoked');
    const [stale] = (await notificationsFor(pendingUser)).filter((n) => n.kind === 'buddy_invite');
    expect(stale).toMatchObject({ invite_status: 'revoked', session_id: null, session_title: null });
    await expect(respond(pendingUser, pending.id, true)).rejects.toThrow(/invite_no_longer_valid/);

    await shareSession(owner.id, session.id, 'followers');
    expect((await inviteRow(session.id, pendingUser.id)).status).toBe('revoked');
    // Only an explicit new invitation re-activates it.
    await invite(owner, session.id, [pendingUser.id]);
    expect((await inviteRow(session.id, pendingUser.id)).status).toBe('pending');
    await remove(owner, pending.id);
    expect(await inviteRow(session.id, pendingUser.id)).toBeUndefined();
    expect((await notificationsFor(pendingUser)).filter((n) => n.kind === 'buddy_invite')).toHaveLength(0);
  });

  test('an accepted buddy who unfollows keeps attribution but loses access', async () => {
    await unfollow(buddy.id, owner.id);
    expect(await canSeeSession(buddy, session.id)).toBe(false);
    expect((await buddiesVisibleTo(viewer, session.id)).map((r) => r.buddy_id)).toContain(buddy.id);
    await follow(buddy.id, owner.id);
  });

  test('an accepted buddy can remove themselves; others cannot remove them', async () => {
    const row = await inviteRow(session.id, buddy.id);
    await expect(remove(viewer, row.id)).rejects.toThrow(/invite_not_found/);
    await remove(buddy, row.id);
    expect(await inviteRow(session.id, buddy.id)).toBeUndefined();
    await remove(buddy, row.id); // idempotent
  });

  test('the owner can remove a pending invitation or an accepted buddy', async () => {
    await invite(owner, session.id, [buddy.id]);
    const row = await inviteRow(session.id, buddy.id);
    await respond(buddy, row.id, true);
    await remove(owner, row.id);
    expect(await inviteRow(session.id, buddy.id)).toBeUndefined();
  });

  test('at most 10 active buddies per session', async () => {
    const many = await Promise.all(Array.from({ length: 11 }, (_, i) => createUser(`bd_m${i}`)));
    await expect(invite(owner, session.id, many.map((u) => u.id))).rejects.toThrow(/too_many_buddies/);
  });
});
