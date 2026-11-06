import { activeElapsedMs } from '../../src/lib/timer';
import { parseTimestamp } from '../../src/lib/time';
import {
  asAdmin,
  asAnon,
  asUser,
  closePool,
  createSubject,
  createUser,
  randomUUID,
  rpc,
  simulateElapsed,
  type SessionPayload,
  type TestUser,
} from './helpers';

let a: TestUser;
let b: TestUser;
let subjectA: string;

beforeAll(async () => {
  a = await createUser('timer_a');
  b = await createUser('timer_b');
  subjectA = await createSubject(a.id, 'Calculus', '#0EA5E9');
});

afterAll(closePool);

async function start(user: TestUser, id = randomUUID(), subject = subjectA): Promise<SessionPayload> {
  return rpc(user.id, 'start_session', {
    p_session_id: id,
    p_subject_id: subject,
    p_intention: 'Finish problem set 4',
    p_goal_id: null,
  });
}

async function cleanupActive(user: TestUser) {
  await asAdmin((c) => c.query("delete from public.study_sessions where user_id = $1 and status = 'active'", [user.id]));
}

describe('timer lifecycle RPCs', () => {
  afterEach(() => cleanupActive(a));

  test('start creates a running, private session with a subject snapshot', async () => {
    const res = await start(a);
    expect(res.session).toMatchObject({
      status: 'active',
      timer_state: 'running',
      visibility: 'private',
      subject_name: 'Calculus',
      subject_color: '#0EA5E9',
      intention: 'Finish problem set 4',
      accumulated_ms: 0,
    });
    expect(res.server_now).toBeTruthy();
  });

  test('pause/resume excludes paused time from the recorded duration', async () => {
    const { session } = await start(a);
    const id = session!.id;

    // 10 minutes of studying, then pause.
    await simulateElapsed(id, 600);
    const paused: SessionPayload = await rpc(a.id, 'pause_session', { p_session_id: id, p_at: null });
    expect(paused.session!.timer_state).toBe('paused');
    expect(Number(paused.session!.accumulated_ms)).toBeGreaterThanOrEqual(600_000);
    expect(Number(paused.session!.accumulated_ms)).toBeLessThan(602_000);

    // A 30 minute break: shift started_at only (paused sessions have no running segment).
    await asAdmin((c) =>
      c.query("update public.study_sessions set started_at = started_at - interval '30 minutes' where id = $1", [id]),
    );

    // Elapsed while paused is frozen, independent of wall-clock time.
    const frozen = activeElapsedMs(paused.session as any, Date.now() + 3_600_000);
    expect(frozen).toBe(Number(paused.session!.accumulated_ms));

    const resumed: SessionPayload = await rpc(a.id, 'resume_session', { p_session_id: id });
    expect(resumed.session!.timer_state).toBe('running');

    // 5 more minutes, then finish.
    await simulateElapsed(id, 300);
    const done: SessionPayload = await rpc(a.id, 'finish_session', { p_session_id: id, p_at: null });
    expect(done.session!.status).toBe('completed');
    expect(done.session!.duration_seconds).toBeGreaterThanOrEqual(900);
    expect(done.session!.duration_seconds).toBeLessThanOrEqual(902);
    expect(done.session!.visibility).toBe('private');
    expect(done.session!.title).toBe('Calculus session');
  });

  test('elapsed time is derived from persisted timestamps (restart / background safe)', async () => {
    const { session, server_now } = await start(a);
    await simulateElapsed(session!.id, 120);

    // Simulate an app restart: re-fetch purely from the server.
    const fetched: SessionPayload = await rpc(a.id, 'get_active_session', {});
    expect(fetched.session!.id).toBe(session!.id);
    const elapsed = activeElapsedMs(fetched.session as any, parseTimestamp(fetched.server_now));
    expect(elapsed).toBeGreaterThanOrEqual(120_000);
    expect(elapsed).toBeLessThan(125_000);
    expect(server_now).toBeTruthy();
  });

  test('repeated pause and resume calls are idempotent', async () => {
    const { session } = await start(a);
    await simulateElapsed(session!.id, 60);
    const p1: SessionPayload = await rpc(a.id, 'pause_session', { p_session_id: session!.id, p_at: null });
    const p2: SessionPayload = await rpc(a.id, 'pause_session', { p_session_id: session!.id, p_at: null });
    expect(p2.session!.accumulated_ms).toBe(p1.session!.accumulated_ms);

    const r1: SessionPayload = await rpc(a.id, 'resume_session', { p_session_id: session!.id });
    const r2: SessionPayload = await rpc(a.id, 'resume_session', { p_session_id: session!.id });
    expect(r2.session!.running_since).toBe(r1.session!.running_since);
  });

  test('a retried pause records the moment the user tapped, clamped to the segment', async () => {
    const { session } = await start(a);
    await simulateElapsed(session!.id, 600);
    // The user tapped pause 4 minutes ago but the request only now got through.
    const tappedAt = new Date(Date.now() - 240_000).toISOString();
    const res: SessionPayload = await rpc(a.id, 'pause_session', { p_session_id: session!.id, p_at: tappedAt });
    const ms = Number(res.session!.accumulated_ms);
    expect(ms).toBeGreaterThanOrEqual(358_000);
    expect(ms).toBeLessThanOrEqual(362_000);
  });

  test('client timestamps cannot extend a session into the future or before it started', async () => {
    const { session } = await start(a);
    await simulateElapsed(session!.id, 60);
    const future = new Date(Date.now() + 10 * 3_600_000).toISOString();
    const res: SessionPayload = await rpc(a.id, 'finish_session', { p_session_id: session!.id, p_at: future });
    expect(res.session!.duration_seconds).toBeLessThanOrEqual(62);

    const { session: s2 } = await start(a);
    const past = new Date(Date.now() - 10 * 3_600_000).toISOString();
    const res2: SessionPayload = await rpc(a.id, 'finish_session', { p_session_id: s2!.id, p_at: past });
    expect(res2.session!.duration_seconds).toBe(0);
  });

  test('discard removes an active session; it never counts', async () => {
    const { session } = await start(a);
    const res = await rpc(a.id, 'discard_session', { p_session_id: session!.id });
    expect(res.discarded).toBe(true);
    const { rows } = await asUser(a.id, (c) => c.query('select 1 from public.study_sessions where id = $1', [session!.id]));
    expect(rows).toHaveLength(0);
    // Discarding twice is harmless.
    await expect(rpc(a.id, 'discard_session', { p_session_id: session!.id })).resolves.toMatchObject({ discarded: true });
  });

  test('a stale discard cannot delete a session that was already finished', async () => {
    const { session } = await start(a);
    await rpc(a.id, 'finish_session', { p_session_id: session!.id, p_at: null });
    await expect(rpc(a.id, 'discard_session', { p_session_id: session!.id })).rejects.toThrow('session_already_completed');
  });

  test('pausing a session finished on another device reports session_not_active', async () => {
    const { session } = await start(a);
    await rpc(a.id, 'finish_session', { p_session_id: session!.id, p_at: null });
    await expect(rpc(a.id, 'pause_session', { p_session_id: session!.id, p_at: null })).rejects.toThrow(
      'session_not_active',
    );
    await expect(rpc(a.id, 'resume_session', { p_session_id: session!.id })).rejects.toThrow('session_not_active');
  });
});

describe('duplicate prevention', () => {
  afterEach(() => cleanupActive(a));

  test('retrying start with the same id returns the same session (no duplicate)', async () => {
    const id = randomUUID();
    const first = await start(a, id);
    const retry = await start(a, id);
    expect(retry.session!.id).toBe(first.session!.id);
    expect(retry.session!.started_at).toBe(first.session!.started_at);
    const { rows } = await asUser(a.id, (c) => c.query("select count(*)::int as n from public.study_sessions where status = 'active'"));
    expect(rows[0].n).toBe(1);
  });

  test('only one active session per account (second device / second tap)', async () => {
    await start(a);
    await expect(start(a)).rejects.toThrow('active_session_exists');
  });

  test('concurrent starts from two devices produce exactly one active session', async () => {
    const results = await Promise.allSettled([start(a), start(a), start(a)]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(2);
    for (const f of failed) expect(String(f.reason.message)).toContain('active_session_exists');
  });

  test('finish is idempotent: repeated or concurrent completion saves exactly once', async () => {
    const { session } = await start(a);
    await simulateElapsed(session!.id, 1500);
    const results = await Promise.all([
      rpc(a.id, 'finish_session', { p_session_id: session!.id, p_at: null }),
      rpc(a.id, 'finish_session', { p_session_id: session!.id, p_at: null }),
    ]);
    expect(results[0].session.duration_seconds).toBe(results[1].session.duration_seconds);
    expect(results[0].session.completed_at).toBe(results[1].session.completed_at);

    // A later retry (e.g. after a timeout) returns the same saved row.
    await simulateElapsed(session!.id, 0);
    const later: SessionPayload = await rpc(a.id, 'finish_session', { p_session_id: session!.id, p_at: null });
    expect(later.session!.duration_seconds).toBe(results[0].session.duration_seconds);
    expect(later.session!.completed_at).toBe(results[0].session.completed_at);

    const { rows } = await asUser(a.id, (c) => c.query('select count(*)::int as n from public.study_sessions where id = $1', [session!.id]));
    expect(rows[0].n).toBe(1);
  });
});

describe('unauthorized timer access', () => {
  afterEach(() => cleanupActive(a));

  test("another user cannot pause, finish or discard someone else's session", async () => {
    const { session } = await start(a);
    await expect(rpc(b.id, 'pause_session', { p_session_id: session!.id, p_at: null })).rejects.toThrow('session_not_found');
    await expect(rpc(b.id, 'finish_session', { p_session_id: session!.id, p_at: null })).rejects.toThrow('session_not_found');
    // Discard by a stranger is a no-op that reveals nothing.
    await rpc(b.id, 'discard_session', { p_session_id: session!.id });
    const still: SessionPayload = await rpc(a.id, 'get_active_session', {});
    expect(still.session!.id).toBe(session!.id);
  });

  test("starting with another user's session id or subject is rejected", async () => {
    const { session } = await start(a);
    await expect(
      rpc(b.id, 'start_session', { p_session_id: session!.id, p_subject_id: subjectA, p_intention: null, p_goal_id: null }),
    ).rejects.toThrow('session_id_conflict');
    await expect(
      rpc(b.id, 'start_session', { p_session_id: randomUUID(), p_subject_id: subjectA, p_intention: null, p_goal_id: null }),
    ).rejects.toThrow('subject_not_found');
  });

  test('sessions cannot be inserted directly or have their duration/timer edited', async () => {
    await expect(
      asUser(a.id, (c) =>
        c.query(
          `insert into public.study_sessions (user_id, subject_id, subject_name, subject_color, status, timer_state, running_since)
           values ($1, $2, 'x', '#000000', 'active', 'running', now())`,
          [a.id, subjectA],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    const { session } = await start(a);
    await rpc(a.id, 'finish_session', { p_session_id: session!.id, p_at: null });
    for (const sql of [
      'update public.study_sessions set duration_seconds = 99999 where id = $1',
      "update public.study_sessions set status = 'active' where id = $1",
      'update public.study_sessions set accumulated_ms = 0 where id = $1',
      'update public.study_sessions set like_count = 1000 where id = $1',
      'update public.study_sessions set user_id = user_id where id = $1',
    ]) {
      await expect(asUser(a.id, (c) => c.query(sql, [session!.id]))).rejects.toThrow(/permission denied/);
    }
  });

  test('anonymous clients cannot call timer RPCs', async () => {
    await expect(
      asAnon((c) => c.query('select public.start_session($1, $2, null, null)', [randomUUID(), subjectA])),
    ).rejects.toThrow(/permission denied/);
  });
});
