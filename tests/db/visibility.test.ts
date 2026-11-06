import { computeWeekStats, type StatSession } from '../../src/lib/stats';
import { localWeekRange } from '../../src/lib/week';
import {
  asAdmin,
  asAnon,
  asUser,
  closePool,
  completeSession,
  createSubject,
  createUser,
  feedIds,
  follow,
  randomUUID,
  rpc,
  shareSession,
  simulateElapsed,
  unfollow,
  visibleSessionIds,
  type TestUser,
} from './helpers';

afterAll(closePool);

/** Simulates the Storage API inserting an object under the caller's RLS. */
function uploadObject(user: TestUser, bucket: string, name: string) {
  return asUser(user.id, (c) =>
    c.query(
      'insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1, $2, $3::uuid, $3::text, $4) returning id',
      [bucket, name, user.id, JSON.stringify({ mimetype: 'image/jpeg', size: 1000 })],
    ),
  );
}

/** Simulates the Storage API reading an object (download / createSignedUrl). */
async function canReadObject(user: TestUser, bucket: string, name: string): Promise<boolean> {
  const { rows } = await asUser(user.id, (c) =>
    c.query('select id from storage.objects where bucket_id = $1 and name = $2', [bucket, name]),
  );
  return rows.length === 1;
}

async function ownStatSessions(user: TestUser): Promise<StatSession[]> {
  const week = localWeekRange(new Date());
  const { rows } = await asUser(user.id, (c) =>
    c.query(
      `select id, subject_id, subject_name, subject_color, to_json(started_at)#>>'{}' as started_at,
              duration_seconds, accomplishment
         from public.study_sessions
        where status = 'completed' and started_at >= $1 and started_at < $2`,
      [week.start.toISOString(), week.end.toISOString()],
    ),
  );
  return rows;
}

describe('two-account scenario (A shares, B interacts, A keeps a private session)', () => {
  let a: TestUser;
  let b: TestUser;
  let subjectA: string;
  let shared: Record<string, any>;
  let privateSession: Record<string, any>;
  const photoName = () => `${a.id}/${shared.id}/${randomUUID()}.jpg`;
  let sharedPhoto: string;
  let privatePhoto: string;

  beforeAll(async () => {
    a = await createUser('alice');
    b = await createUser('bob');
  });

  test('1. A creates a subject, starts, pauses/resumes and finishes a session', async () => {
    subjectA = await createSubject(a.id, 'CS 31', '#6366F1');
    const id = randomUUID();
    await rpc(a.id, 'start_session', { p_session_id: id, p_subject_id: subjectA, p_intention: 'Pointers practice', p_goal_id: null });
    await simulateElapsed(id, 1200);
    await rpc(a.id, 'pause_session', { p_session_id: id, p_at: null });
    await asAdmin((c) => c.query("update public.study_sessions set started_at = started_at - interval '10 minutes' where id = $1", [id]));
    await rpc(a.id, 'resume_session', { p_session_id: id });
    await simulateElapsed(id, 600);
    const done = await rpc(a.id, 'finish_session', { p_session_id: id, p_at: null });
    shared = done.session;
    expect(shared.duration_seconds).toBeGreaterThanOrEqual(1800);
    expect(shared.duration_seconds).toBeLessThanOrEqual(1802);
    expect(shared.visibility).toBe('private');
  });

  test('2. A records an accomplishment, attaches a photo and a song link', async () => {
    sharedPhoto = photoName();
    await uploadObject(a, 'session-photos', sharedPhoto);
    await asUser(a.id, (c) =>
      c.query(
        `update public.study_sessions
            set title = 'Pointer drills', accomplishment = 'Finished 12 pointer problems',
                mood = 'proud', photo_path = $2, song_title = 'Weightless', song_artist = 'Marconi Union',
                song_url = 'https://open.spotify.com/track/6kkwzB6hXLIONkEk9JciA6'
          where id = $1`,
        [shared.id, sharedPhoto],
      ),
    );
    const { rows } = await asUser(a.id, (c) => c.query('select * from public.study_sessions where id = $1', [shared.id]));
    expect(rows[0]).toMatchObject({ accomplishment: 'Finished 12 pointer problems', photo_path: sharedPhoto, mood: 'proud' });
  });

  test('before sharing, B cannot see the session even when following A', async () => {
    await follow(b.id, a.id);
    expect(await feedIds(b.id)).not.toContain(shared.id);
    expect(await canReadObject(b, 'session-photos', sharedPhoto)).toBe(false);
    await unfollow(b.id, a.id);
  });

  test('3. A shares the session to followers', async () => {
    await shareSession(a.id, shared.id, 'followers');
    expect(await feedIds(a.id)).toContain(shared.id); // A's own feed includes it
  });

  test('a non-follower still cannot see the shared session, its photo or interact', async () => {
    expect(await visibleSessionIds(b.id, 'id = $1', [shared.id])).toEqual([]);
    expect(await canReadObject(b, 'session-photos', sharedPhoto)).toBe(false);
    await expect(
      asUser(b.id, (c) => c.query('insert into public.likes (session_id, user_id) values ($1, $2)', [shared.id, b.id])),
    ).rejects.toThrow(/row-level security/);
  });

  test('4. B follows A, sees the session and photo, likes and comments', async () => {
    await follow(b.id, a.id);
    expect(await feedIds(b.id)).toContain(shared.id);
    expect(await canReadObject(b, 'session-photos', sharedPhoto)).toBe(true);

    await asUser(b.id, (c) => c.query('insert into public.likes (session_id, user_id) values ($1, $2)', [shared.id, b.id]));
    await asUser(b.id, (c) =>
      c.query('insert into public.comments (session_id, user_id, body) values ($1, $2, $3)', [shared.id, b.id, 'Nice work!']),
    );
  });

  test('5. A sees B’s like and comment, and counters are updated', async () => {
    const { rows: likes } = await asUser(a.id, (c) => c.query('select user_id from public.likes where session_id = $1', [shared.id]));
    expect(likes.map((l) => l.user_id)).toEqual([b.id]);
    const { rows: comments } = await asUser(a.id, (c) => c.query('select user_id, body from public.comments where session_id = $1', [shared.id]));
    expect(comments).toEqual([{ user_id: b.id, body: 'Nice work!' }]);
    const { rows } = await asUser(a.id, (c) => c.query('select like_count, comment_count from public.study_sessions where id = $1', [shared.id]));
    expect(rows[0]).toEqual({ like_count: 1, comment_count: 1 });
  });

  test('6. A creates a private session B cannot access through any direct request', async () => {
    privateSession = await completeSession(a.id, subjectA, 2400, { intention: 'Secret exam prep' });
    privatePhoto = `${a.id}/${privateSession.id}/${randomUUID()}.jpg`;
    await uploadObject(a, 'session-photos', privatePhoto);
    await asUser(a.id, (c) =>
      c.query("update public.study_sessions set photo_path = $2, accomplishment = 'private notes' where id = $1", [
        privateSession.id,
        privatePhoto,
      ]),
    );

    // Direct table read by id, by user, and via the feed filter.
    expect(await visibleSessionIds(b.id, 'id = $1', [privateSession.id])).toEqual([]);
    expect(await visibleSessionIds(b.id, 'user_id = $1', [a.id])).toEqual([shared.id]);
    expect(await feedIds(b.id)).not.toContain(privateSession.id);
    // Photo object.
    expect(await canReadObject(b, 'session-photos', privatePhoto)).toBe(false);
    // Likes / comments / their reads.
    await expect(
      asUser(b.id, (c) => c.query('insert into public.likes (session_id, user_id) values ($1, $2)', [privateSession.id, b.id])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(b.id, (c) =>
        c.query('insert into public.comments (session_id, user_id, body) values ($1, $2, $3)', [privateSession.id, b.id, 'hi']),
      ),
    ).rejects.toThrow(/row-level security/);
    // Updating or deleting A's sessions affects nothing.
    const upd = await asUser(b.id, (c) =>
      c.query("update public.study_sessions set visibility = 'followers' where id = $1", [privateSession.id]),
    );
    expect(upd.rowCount).toBe(0);
    const del = await asUser(b.id, (c) => c.query('delete from public.study_sessions where id = $1', [privateSession.id]));
    expect(del.rowCount).toBe(0);
    // Private statistics: B cannot read A's subjects, goals or settings.
    const { rows: subj } = await asUser(b.id, (c) => c.query('select * from public.subjects where user_id = $1', [a.id]));
    expect(subj).toEqual([]);
    const { rows: settings } = await asUser(b.id, (c) => c.query('select * from public.user_settings where user_id = $1', [a.id]));
    expect(settings).toEqual([]);
  });

  test('7. A’s own progress includes both sessions (private and shared)', async () => {
    const sessions = await ownStatSessions(a);
    const stats = computeWeekStats(sessions, localWeekRange(new Date()));
    expect(stats.sessionCount).toBe(2);
    expect(stats.totalSeconds).toBe(shared.duration_seconds + privateSession.duration_seconds);
    expect(stats.bySubject).toHaveLength(1);
    expect(stats.bySubject[0].name).toBe('CS 31');
    expect(stats.accomplishmentCount).toBe(2);
  });

  test('8a. making the shared session private removes it, its photo, likes and comments from B', async () => {
    await shareSession(a.id, shared.id, 'private');
    expect(await feedIds(b.id)).not.toContain(shared.id);
    expect(await canReadObject(b, 'session-photos', sharedPhoto)).toBe(false);
    const { rows: likes } = await asUser(b.id, (c) => c.query('select * from public.likes where session_id = $1', [shared.id]));
    expect(likes).toEqual([]);
    const { rows: comments } = await asUser(b.id, (c) => c.query('select * from public.comments where session_id = $1', [shared.id]));
    expect(comments).toEqual([]);
    // B can no longer like it or delete their (now hidden) like on a hidden session either.
    // A still sees everything and the session still counts toward A's stats.
    const stats = computeWeekStats(await ownStatSessions(a), localWeekRange(new Date()));
    expect(stats.sessionCount).toBe(2);

    await shareSession(a.id, shared.id, 'followers');
    expect(await feedIds(b.id)).toContain(shared.id);
  });

  test('8b. unfollowing removes access to followers-only sessions and photos', async () => {
    await unfollow(b.id, a.id);
    expect(await feedIds(b.id)).not.toContain(shared.id);
    expect(await canReadObject(b, 'session-photos', sharedPhoto)).toBe(false);
    await follow(b.id, a.id);
  });

  test('8c. deleting a session removes it from feeds, stats, likes and comments', async () => {
    await asUser(a.id, (c) => c.query('delete from public.study_sessions where id = $1', [shared.id]));
    expect(await feedIds(b.id)).not.toContain(shared.id);
    expect(await feedIds(a.id)).not.toContain(shared.id);
    const { rows } = await asAdmin((c) =>
      c.query(
        `select (select count(*) from public.likes where session_id = $1)::int as likes,
                (select count(*) from public.comments where session_id = $1)::int as comments`,
        [shared.id],
      ),
    );
    expect(rows[0]).toEqual({ likes: 0, comments: 0 });
    // The orphaned photo object (removed by the client via the Storage API) is
    // no longer readable by B because no visible session references it.
    expect(await canReadObject(b, 'session-photos', sharedPhoto)).toBe(false);
    const stats = computeWeekStats(await ownStatSessions(a), localWeekRange(new Date()));
    expect(stats.sessionCount).toBe(1);
    expect(stats.totalSeconds).toBe(privateSession.duration_seconds);
  });
});

describe('anonymous access', () => {
  test('anon cannot read any application table', async () => {
    for (const table of ['profiles', 'follows', 'subjects', 'goals', 'study_sessions', 'likes', 'comments', 'user_settings']) {
      await expect(asAnon((c) => c.query(`select * from public.${table} limit 1`))).rejects.toThrow(/permission denied/);
    }
  });

  test('anon cannot read any storage object', async () => {
    const u = await createUser('anon_check');
    await uploadObject(u, 'avatars', `${u.id}/${randomUUID()}.jpg`);
    const { rows } = await asAnon((c) => c.query('select * from storage.objects'));
    expect(rows).toEqual([]);
  });
});

describe('storage path rules', () => {
  let owner: TestUser;
  let other: TestUser;
  let sessionId: string;

  beforeAll(async () => {
    owner = await createUser('photo_owner');
    other = await createUser('photo_other');
    const subject = await createSubject(owner.id, 'Physics', '#22C55E');
    sessionId = (await completeSession(owner.id, subject, 600)).id;
  });

  test('owners can upload into their own completed session folder only', async () => {
    await expect(uploadObject(owner, 'session-photos', `${owner.id}/${sessionId}/${randomUUID()}.jpg`)).resolves.toBeTruthy();
    // Wrong extension / bad shape
    await expect(uploadObject(owner, 'session-photos', `${owner.id}/${sessionId}/evil.exe`)).rejects.toThrow(/row-level security/);
    // Not their session
    await expect(uploadObject(other, 'session-photos', `${other.id}/${sessionId}/${randomUUID()}.jpg`)).rejects.toThrow(
      /row-level security/,
    );
    // Someone else's folder
    await expect(uploadObject(other, 'session-photos', `${owner.id}/${sessionId}/${randomUUID()}.jpg`)).rejects.toThrow(
      /row-level security/,
    );
  });

  test('sessions can only reference photos inside their own folder', async () => {
    await expect(
      asUser(owner.id, (c) =>
        c.query('update public.study_sessions set photo_path = $2 where id = $1', [sessionId, `${other.id}/${sessionId}/${randomUUID()}.jpg`]),
      ),
    ).rejects.toThrow(/sessions_photo_in_own_folder/);
  });

  test('avatars: readable by signed-in users, writable only in own folder', async () => {
    const name = `${owner.id}/${randomUUID()}.png`;
    await uploadObject(owner, 'avatars', name);
    expect(await canReadObject(other, 'avatars', name)).toBe(true);
    await expect(uploadObject(other, 'avatars', `${owner.id}/${randomUUID()}.png`)).rejects.toThrow(/row-level security/);
  });
});
