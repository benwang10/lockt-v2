import { randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';

/**
 * Test helpers that reproduce how Supabase's Data API (PostgREST) executes a
 * request: inside a transaction, `set local role authenticated` (or anon) and
 * `request.jwt.claims` containing the user's id. RLS, column grants and
 * SECURITY DEFINER functions therefore behave exactly as for API calls.
 */

// pg returns bigint as string; timestamps stay as ISO-ish strings for parity
// with the JSON the app receives.
const pool = new Pool({
  connectionString: process.env.STUDYLOG_TEST_DATABASE_URL,
  max: 6,
  options: '-c timezone=UTC',
});

export async function closePool() {
  await pool.end();
}

type Fn<T> = (client: PoolClient) => Promise<T>;

async function inTransaction<T>(setup: (c: PoolClient) => Promise<void>, fn: Fn<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await setup(client);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Run queries as a signed-in user (role authenticated, auth.uid() = userId). */
export function asUser<T>(userId: string, fn: Fn<T>): Promise<T> {
  return inTransaction(async (c) => {
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated' }),
    ]);
  }, fn);
}

/** Run queries as an anonymous API client. */
export function asAnon<T>(fn: Fn<T>): Promise<T> {
  return inTransaction(async (c) => {
    await c.query('set local role anon');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'anon' })]);
  }, fn);
}

/** Superuser access for arranging test state (e.g. simulating elapsed time). */
export function asAdmin<T>(fn: Fn<T>): Promise<T> {
  return inTransaction(async () => undefined, fn);
}

let counter = 0;

export type TestUser = { id: string; username: string };

/** Creates an auth user and completes onboarding through RLS as that user. */
export async function createUser(prefix = 'user'): Promise<TestUser> {
  counter += 1;
  const id = randomUUID();
  const username = `${prefix}_${counter}_${id.slice(0, 4)}`.toLowerCase().slice(0, 20);
  await asAdmin((c) => c.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@example.test`]));
  await asUser(id, (c) =>
    c.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [
      id,
      username,
      `${prefix} ${counter}`,
    ]),
  );
  return { id, username };
}

export async function createSubject(userId: string, name = 'CS 31', color = '#4F46E5'): Promise<string> {
  const { rows } = await asUser(userId, (c) =>
    c.query('insert into public.subjects (user_id, name, color) values ($1, $2, $3) returning id', [
      userId,
      name,
      color,
    ]),
  );
  return rows[0].id;
}

export type SessionPayload = {
  session: Record<string, any> | null;
  server_now: string;
};

export async function rpc(userId: string, fn: string, args: Record<string, unknown>): Promise<any> {
  const names = Object.keys(args);
  const placeholders = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
  const { rows } = await asUser(userId, (c) =>
    c.query(`select public.${fn}(${placeholders}) as result`, Object.values(args)),
  );
  return rows[0].result;
}

/** Shift a running session's timestamps into the past to simulate elapsed time. */
export async function simulateElapsed(sessionId: string, seconds: number) {
  await asAdmin((c) =>
    c.query(
      `update public.study_sessions
          set started_at = started_at - make_interval(secs => $2),
              running_since = running_since - make_interval(secs => $2)
        where id = $1`,
      [sessionId, seconds],
    ),
  );
}

/** Start, run for `seconds`, and finish a session. Returns the completed row. */
export async function completeSession(
  userId: string,
  subjectId: string,
  seconds: number,
  opts: { intention?: string } = {},
): Promise<Record<string, any>> {
  const id = randomUUID();
  await rpc(userId, 'start_session', {
    p_session_id: id,
    p_subject_id: subjectId,
    p_intention: opts.intention ?? null,
    p_goal_id: null,
  });
  await simulateElapsed(id, seconds);
  const done: SessionPayload = await rpc(userId, 'finish_session', { p_session_id: id, p_at: null });
  return done.session!;
}

export async function follow(followerId: string, followingId: string) {
  await asUser(followerId, (c) =>
    c.query('insert into public.follows (follower_id, following_id) values ($1, $2)', [followerId, followingId]),
  );
}

export async function unfollow(followerId: string, followingId: string) {
  await asUser(followerId, (c) =>
    c.query('delete from public.follows where follower_id = $1 and following_id = $2', [followerId, followingId]),
  );
}

export async function shareSession(userId: string, sessionId: string, visibility: 'followers' | 'private') {
  await asUser(userId, (c) =>
    c.query('update public.study_sessions set visibility = $2 where id = $1', [sessionId, visibility]),
  );
}

/** Rows of study_sessions the user can see with the given extra filter. */
export async function visibleSessionIds(userId: string, where = 'true', params: unknown[] = []): Promise<string[]> {
  const { rows } = await asUser(userId, (c) =>
    c.query(`select id from public.study_sessions where ${where} order by completed_at desc`, params),
  );
  return rows.map((r) => r.id);
}

/** The exact feed query the app issues (status completed + shared, newest first). */
export async function feedIds(userId: string): Promise<string[]> {
  return visibleSessionIds(userId, "status = 'completed' and visibility = 'followers'");
}

export { randomUUID };
