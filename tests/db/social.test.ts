import {
  asAdmin,
  asUser,
  closePool,
  completeSession,
  createSubject,
  createUser,
  follow,
  randomUUID,
  shareSession,
  type TestUser,
} from './helpers';

afterAll(closePool);

let a: TestUser;
let b: TestUser;
let c: TestUser;
let sessionId: string;
let subjectA: string;

beforeAll(async () => {
  a = await createUser('soc_a');
  b = await createUser('soc_b');
  c = await createUser('soc_c');
  subjectA = await createSubject(a.id, 'Interview Prep', '#F59E0B');
  sessionId = (await completeSession(a.id, subjectA, 900)).id;
  await shareSession(a.id, sessionId, 'followers');
  await follow(b.id, a.id);
});

describe('follows', () => {
  test('cannot follow yourself', async () => {
    await expect(follow(a.id, a.id)).rejects.toThrow(/follows_no_self_follow/);
  });

  test('cannot follow the same person twice', async () => {
    await expect(follow(b.id, a.id)).rejects.toThrow(/duplicate key/);
  });

  test('cannot create or delete follows on behalf of someone else', async () => {
    await expect(
      asUser(c.id, (cl) => cl.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [b.id, c.id])),
    ).rejects.toThrow(/row-level security/);
    const res = await asUser(c.id, (cl) => cl.query('delete from public.follows where follower_id = $1', [b.id]));
    expect(res.rowCount).toBe(0);
  });

  test('follower / following lists are visible to signed-in users', async () => {
    const { rows } = await asUser(c.id, (cl) => cl.query('select follower_id from public.follows where following_id = $1', [a.id]));
    expect(rows.map((r) => r.follower_id)).toEqual([b.id]);
  });
});

describe('likes', () => {
  test('one like per user per session', async () => {
    await asUser(b.id, (cl) => cl.query('insert into public.likes (session_id, user_id) values ($1, $2)', [sessionId, b.id]));
    await expect(
      asUser(b.id, (cl) => cl.query('insert into public.likes (session_id, user_id) values ($1, $2)', [sessionId, b.id])),
    ).rejects.toThrow(/duplicate key/);
    const { rows } = await asUser(a.id, (cl) => cl.query('select like_count from public.study_sessions where id = $1', [sessionId]));
    expect(rows[0].like_count).toBe(1);
  });

  test('cannot like as another user', async () => {
    await expect(
      asUser(b.id, (cl) => cl.query('insert into public.likes (session_id, user_id) values ($1, $2)', [sessionId, a.id])),
    ).rejects.toThrow(/row-level security/);
  });

  test('unlike removes only your own like and updates the counter', async () => {
    const stranger = await asUser(c.id, (cl) => cl.query('delete from public.likes where session_id = $1', [sessionId]));
    expect(stranger.rowCount).toBe(0);
    await asUser(b.id, (cl) => cl.query('delete from public.likes where session_id = $1 and user_id = $2', [sessionId, b.id]));
    const { rows } = await asUser(a.id, (cl) => cl.query('select like_count from public.study_sessions where id = $1', [sessionId]));
    expect(rows[0].like_count).toBe(0);
  });

  test('likes cannot be edited', async () => {
    await expect(
      asUser(b.id, (cl) => cl.query('update public.likes set user_id = $2 where session_id = $1', [sessionId, b.id])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('comments', () => {
  test('users can delete only their own comments', async () => {
    const id = randomUUID();
    await asUser(b.id, (cl) =>
      cl.query('insert into public.comments (id, session_id, user_id, body) values ($1, $2, $3, $4)', [id, sessionId, b.id, 'Great job']),
    );
    // The session owner and strangers cannot delete B's comment.
    expect((await asUser(a.id, (cl) => cl.query('delete from public.comments where id = $1', [id]))).rowCount).toBe(0);
    expect((await asUser(c.id, (cl) => cl.query('delete from public.comments where id = $1', [id]))).rowCount).toBe(0);
    // A retried send with the same client id is rejected as a duplicate, not stored twice.
    await expect(
      asUser(b.id, (cl) =>
        cl.query('insert into public.comments (id, session_id, user_id, body) values ($1, $2, $3, $4)', [id, sessionId, b.id, 'Great job']),
      ),
    ).rejects.toThrow(/duplicate key/);
    expect((await asUser(b.id, (cl) => cl.query('delete from public.comments where id = $1', [id]))).rowCount).toBe(1);
  });

  test('empty or oversized comments are rejected', async () => {
    await expect(
      asUser(b.id, (cl) => cl.query('insert into public.comments (session_id, user_id, body) values ($1, $2, $3)', [sessionId, b.id, '   '])),
    ).rejects.toThrow(/comments_body_length/);
    await expect(
      asUser(b.id, (cl) =>
        cl.query('insert into public.comments (session_id, user_id, body) values ($1, $2, $3)', [sessionId, b.id, 'x'.repeat(501)]),
      ),
    ).rejects.toThrow(/comments_body_length/);
  });
});

describe('profiles and onboarding', () => {
  test('usernames are unique and well-formed', async () => {
    const id = randomUUID();
    await asAdmin((cl) => cl.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.test`]));
    await expect(
      asUser(id, (cl) => cl.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [id, a.username, 'Dup'])),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      asUser(id, (cl) => cl.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [id, 'Bad Name!', 'X'])),
    ).rejects.toThrow(/profiles_username_format/);
  });

  test('cannot create or edit someone else’s profile', async () => {
    const id = randomUUID();
    await asAdmin((cl) => cl.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@x.test`]));
    await expect(
      asUser(c.id, (cl) => cl.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [id, 'imposter', 'X'])),
    ).rejects.toThrow(/row-level security/);
    const res = await asUser(c.id, (cl) => cl.query("update public.profiles set display_name = 'hacked' where id = $1", [a.id]));
    expect(res.rowCount).toBe(0);
  });

  test('search finds people by username or display name and escapes wildcards', async () => {
    const { rows } = await asUser(c.id, (cl) => cl.query('select username from public.search_profiles($1, 20)', ['soc_a']));
    expect(rows.map((r) => r.username)).toContain(a.username);
    const { rows: wild } = await asUser(c.id, (cl) => cl.query('select username from public.search_profiles($1, 20)', ['%']));
    expect(wild).toEqual([]);
    const { rows: self } = await asUser(c.id, (cl) => cl.query('select id from public.search_profiles($1, 20)', [c.username]));
    expect(self).toEqual([]);
  });
});

describe('session detail validation', () => {
  test('only supported https music links are accepted', async () => {
    const ok = ['https://open.spotify.com/track/abc', 'https://music.apple.com/us/album/x/1?i=2', 'https://spotify.link/xyz'];
    for (const url of ok) {
      await asUser(a.id, (cl) =>
        cl.query("update public.study_sessions set song_title = 'Song', song_url = $2 where id = $1", [sessionId, url]),
      );
    }
    const bad = ['http://open.spotify.com/track/abc', 'https://evil.example/track', 'javascript:alert(1)', 'https://open.spotify.com.evil.io/x'];
    for (const url of bad) {
      await expect(
        asUser(a.id, (cl) => cl.query("update public.study_sessions set song_title = 'Song', song_url = $2 where id = $1", [sessionId, url])),
      ).rejects.toThrow(/sessions_song_url_supported/);
    }
  });

  test('a song link requires a title', async () => {
    await expect(
      asUser(a.id, (cl) =>
        cl.query("update public.study_sessions set song_title = null, song_url = 'https://open.spotify.com/track/a' where id = $1", [sessionId]),
      ),
    ).rejects.toThrow(/sessions_song_needs_title/);
  });

  test('a session can only link the owner’s own goal', async () => {
    const { rows } = await asUser(c.id, (cl) =>
      cl.query("insert into public.goals (user_id, kind, title) values ($1, 'milestone', 'C goal') returning id", [c.id]),
    );
    await expect(
      asUser(a.id, (cl) => cl.query('update public.study_sessions set goal_id = $2 where id = $1', [sessionId, rows[0].id])),
    ).rejects.toThrow(/sessions_goal_owned/);
  });
});

describe('subjects and goals', () => {
  test('renaming a subject updates history; archiving keeps it intact', async () => {
    await asUser(a.id, (cl) => cl.query("update public.subjects set name = 'Interviews' where id = $1", [subjectA]));
    const { rows } = await asUser(b.id, (cl) => cl.query('select subject_name from public.study_sessions where id = $1', [sessionId]));
    expect(rows[0].subject_name).toBe('Interviews');

    await asUser(a.id, (cl) => cl.query('update public.subjects set archived_at = now() where id = $1', [subjectA]));
    const { rows: after } = await asUser(a.id, (cl) => cl.query('select subject_name from public.study_sessions where id = $1', [sessionId]));
    expect(after[0].subject_name).toBe('Interviews');
    // Subjects with history cannot be hard-deleted (archive instead).
    await expect(asUser(a.id, (cl) => cl.query('delete from public.subjects where id = $1', [subjectA]))).rejects.toThrow(
      /violates foreign key/,
    );
    // Archived subjects cannot start new sessions.
    await expect(
      asUser(a.id, (cl) => cl.query('select public.start_session($1, $2, null, null)', [randomUUID(), subjectA])),
    ).rejects.toThrow(/subject_not_found/);
  });

  test('duplicate active subject names are rejected per user', async () => {
    await createSubject(c.id, 'Biology');
    await expect(createSubject(c.id, ' biology ')).rejects.toThrow(/subjects_active_name_per_user/);
    await createSubject(a.id, 'Biology'); // other users may reuse names
  });

  test('goal fields are validated by kind', async () => {
    await expect(
      asUser(c.id, (cl) => cl.query("insert into public.goals (user_id, kind, title) values ($1, 'weekly_time', 'No target')", [c.id])),
    ).rejects.toThrow(/goals_kind_fields/);
    await asUser(c.id, (cl) =>
      cl.query("insert into public.goals (user_id, kind, title, weekly_target_minutes) values ($1, 'weekly_time', '10h', 600)", [c.id]),
    );
    const { rows } = await asUser(a.id, (cl) => cl.query('select * from public.goals where user_id = $1', [c.id]));
    expect(rows).toEqual([]); // goals are private
  });

  test('deleting a goal unlinks sessions instead of deleting them', async () => {
    const { rows } = await asUser(a.id, (cl) =>
      cl.query("insert into public.goals (user_id, kind, title) values ($1, 'milestone', 'Finish mock interview') returning id", [a.id]),
    );
    await asUser(a.id, (cl) => cl.query('update public.study_sessions set goal_id = $2 where id = $1', [sessionId, rows[0].id]));
    await asUser(a.id, (cl) => cl.query('delete from public.goals where id = $1', [rows[0].id]));
    const { rows: s } = await asUser(a.id, (cl) => cl.query('select goal_id from public.study_sessions where id = $1', [sessionId]));
    expect(s[0].goal_id).toBeNull();
  });
});
