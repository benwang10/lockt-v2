/**
 * v2.5: beta feedback and custom note emoji, exercised the way PostgREST runs
 * them (role authenticated + JWT claims).
 */
import { asAdmin, asAnon, asUser, closePool, createUser, rpc } from './helpers';

afterAll(closePool);

const submit = (userId: string, args: Record<string, unknown>) =>
  rpc(userId, 'submit_feedback', { p_category: 'bug', p_message: 'Timer froze', p_app_version: '2.5.0', p_platform: 'web', ...args });

describe('feedback', () => {
  test('a signed-in user can submit; the server stamps account, time and trimmed text', async () => {
    const a = await createUser('fb');
    await submit(a.id, { p_message: '  The Finish button jumped  ' });
    const { rows } = await asAdmin((c) => c.query('select * from public.feedback where user_id = $1', [a.id]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'bug', message: 'The Finish button jumped', app_version: '2.5.0', platform: 'web' });
    expect(rows[0].created_at).toBeTruthy();
  });

  test('nobody can read feedback through the API — not even their own', async () => {
    const a = await createUser('fb');
    const b = await createUser('fb');
    await submit(a.id, {});
    await expect(asUser(a.id, (c) => c.query('select * from public.feedback'))).rejects.toThrow(/permission denied/);
    await expect(asUser(b.id, (c) => c.query('select * from public.feedback'))).rejects.toThrow(/permission denied/);
    await expect(asAnon((c) => c.query('select * from public.feedback'))).rejects.toThrow(/permission denied/);
  });

  test('no direct writes: insert as someone else, update and delete are refused', async () => {
    const a = await createUser('fb');
    const b = await createUser('fb');
    await expect(
      asUser(a.id, (c) =>
        c.query("insert into public.feedback (user_id, category, message) values ($1, 'bug', 'spoofed')", [b.id]),
      ),
    ).rejects.toThrow(/permission denied/);
    await submit(a.id, {});
    await expect(asUser(a.id, (c) => c.query("update public.feedback set message = 'edited'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(a.id, (c) => c.query('delete from public.feedback'))).rejects.toThrow(/permission denied/);
  });

  test('anonymous clients cannot submit', async () => {
    await expect(
      asAnon((c) => c.query("select public.submit_feedback('bug', 'hello', null, null)")),
    ).rejects.toThrow(/permission denied/);
  });

  test('validation: category, empty, too long; app version is capped and platform normalised', async () => {
    const a = await createUser('fb');
    await expect(submit(a.id, { p_category: 'praise' })).rejects.toThrow(/feedback_invalid_category/);
    await expect(submit(a.id, { p_message: '   ' })).rejects.toThrow(/feedback_empty/);
    await expect(submit(a.id, { p_message: 'x'.repeat(2001) })).rejects.toThrow(/feedback_too_long/);
    await submit(a.id, { p_category: 'suggestion', p_message: 'y'.repeat(2000), p_app_version: 'v'.repeat(80), p_platform: 'toaster' });
    const { rows } = await asAdmin((c) => c.query('select category, char_length(app_version) as v, platform from public.feedback where user_id = $1', [a.id]));
    expect(rows).toEqual([{ category: 'suggestion', v: 32, platform: 'other' }]);
  });

  test('rate limit: 20 per hour per account', async () => {
    const a = await createUser('fb');
    for (let i = 0; i < 20; i++) await submit(a.id, { p_message: `note ${i}` });
    await expect(submit(a.id, { p_message: 'one more' })).rejects.toThrow(/feedback_rate_limited/);
    // Another account is unaffected.
    const b = await createUser('fb');
    await expect(submit(b.id, {})).resolves.not.toThrow();
  });
});

describe('note emoji (custom emoji from the keyboard)', () => {
  test.each(['👍🏽', '👩🏽‍💻', '🧑‍🤝‍🧑', '👨‍👩‍👧‍👦', '🏳️‍🌈', '🇺🇸', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '❤️‍🔥', '#️⃣'])('%s is accepted', async (emoji) => {
    const a = await createUser('emoji');
    const { rows } = await asUser(a.id, (c) => c.query('select * from public.set_status($1, $2)', [emoji, null]));
    expect(rows[0].emoji).toBe(emoji);
  });

  test('letters, digits and spaces are still refused', async () => {
    const a = await createUser('emoji');
    for (const bad of ['ab', '1️⃣', '🙂 🙂']) {
      await expect(asUser(a.id, (c) => c.query('select * from public.set_status($1, $2)', [bad, null]))).rejects.toThrow(/profile_statuses_emoji_format/);
    }
  });
});
