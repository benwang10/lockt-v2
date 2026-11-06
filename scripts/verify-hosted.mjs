#!/usr/bin/env node
/**
 * End-to-end check of a HOSTED Supabase project through the real services
 * (Auth, PostgREST, Storage) using only the public (anon/publishable) key —
 * exactly what the app uses. No service-role key is needed or accepted.
 *
 *   npm run verify:hosted
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL and the public key from .env. Asks for two
 * test accounts (A and B) that already completed onboarding in the app.
 * Passwords are typed into a hidden prompt (or LOCKT_A_PASSWORD /
 * LOCKT_B_PASSWORD env vars) and never printed or stored.
 *
 * Everything it creates (a temporary subject, two sessions, a photo each, a
 * like, a comment) is deleted at the end, and B's follow of A is restored to
 * what it was before the run. It refuses to run if A has an active session.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function loadDotEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadDotEnv();

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
if (!/^https:\/\/.+/.test(URL_) || KEY.length < 20) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL (https://…) and EXPO_PUBLIC_SUPABASE_ANON_KEY or _PUBLISHABLE_KEY in .env first.');
  process.exit(2);
}
if (KEY.startsWith('sb_secret_') || /service_role/.test(Buffer.from(KEY.split('.')[1] ?? '', 'base64').toString())) {
  console.error('Refusing to run: the key in .env is a SECRET/service-role key. Use the anon or publishable key.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Prompts (password input hidden)
// ---------------------------------------------------------------------------
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function credentials(label) {
  const email = process.env[`LOCKT_${label}_EMAIL`] || (await ask(`Account ${label} email: `));
  const password = process.env[`LOCKT_${label}_PASSWORD`] || (await ask(`Account ${label} password (hidden): `, { hidden: true }));
  return { email, password };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return !!ok;
}
function skip(name, reason) {
  console.log(`SKIP  ${name}  (${reason})`);
}
async function notificationsOf(user) {
  return rpc(user.client, 'list_notifications', { p_before_created_at: null, p_before_id: null, p_limit: 50 });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (email) => email.replace(/^(.).*(@.*)$/, '$1***$2');
const newClient = () =>
  createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

// 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);
const pngBody = () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength);

async function signIn(label) {
  const { email, password } = await credentials(label);
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Account ${label} (${mask(email)}) sign-in failed: ${error.message}`);
  const { data: profile, error: pErr } = await client.from('profiles').select('id, username').eq('id', data.user.id).maybeSingle();
  if (pErr) throw new Error(`Reading profile for ${label} failed: ${pErr.message}`);
  if (!profile) throw new Error(`Account ${label} has no profile yet — finish onboarding in the app first.`);
  return { client, id: data.user.id, username: profile.username, email, password };
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code, raw: error });
  return data;
}

function weekStart(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}
async function weekTotals(user) {
  const start = weekStart();
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const { data, error } = await user.client
    .from('study_sessions')
    .select('id, duration_seconds')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('started_at', start.toISOString())
    .lt('started_at', end.toISOString());
  if (error) throw error;
  return { count: data.length, seconds: data.reduce((s, r) => s + r.duration_seconds, 0), ids: new Set(data.map((r) => r.id)) };
}

async function canSee(user, sessionId) {
  const { data, error } = await user.client.from('study_sessions').select('id').eq('id', sessionId);
  if (error) throw error;
  return data.length === 1;
}
async function signedUrlWorks(user, path) {
  const { data, error } = await user.client.storage.from('session-photos').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return false;
  const res = await fetch(data.signedUrl);
  return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
}

async function createCompletedSession(a, subjectId, { pauseMs = 0 } = {}) {
  const id = randomUUID();
  await rpc(a.client, 'start_session', { p_session_id: id, p_subject_id: subjectId, p_intention: 'verify-hosted run', p_goal_id: null });
  await sleep(1500);
  if (pauseMs) {
    await rpc(a.client, 'pause_session', { p_session_id: id, p_at: null });
    await sleep(pauseMs);
    await rpc(a.client, 'resume_session', { p_session_id: id });
    await sleep(1000);
  }
  return (await rpc(a.client, 'finish_session', { p_session_id: id, p_at: null })).session;
}

async function attachPhoto(a, sessionId) {
  const path = `${a.id}/${sessionId}/${randomUUID()}.png`;
  const { error } = await a.client.storage.from('session-photos').upload(path, pngBody(), { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  const { error: uErr } = await a.client.from('study_sessions').update({ photo_path: path }).eq('id', sessionId);
  if (uErr) throw new Error(`setting photo_path failed: ${uErr.message}`);
  return path;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const cleanup = [];
let a;
let b;
let bFollowedBefore = null;

try {
  console.log(`Project: ${URL_}\n`);
  a = await signIn('A');
  b = await signIn('B');
  if (a.id === b.id) throw new Error('A and B must be different accounts.');
  console.log(`A = @${a.username}, B = @${b.username}\n`);

  // Anonymous access
  const anon = newClient();
  const { error: anonErr } = await anon.from('study_sessions').select('id').limit(1);
  check('anonymous client cannot read sessions', anonErr && (anonErr.code === '42501' || /permission/i.test(anonErr.message)), anonErr?.code);

  // Refuse to touch a real active session
  const activeA = await rpc(a.client, 'get_active_session', {});
  if (activeA.session) throw new Error('Account A has an active session. Finish or discard it in the app, then rerun.');

  const before = await weekTotals(a);

  // Temporary subject
  const subjectName = `Verify ${new Date().toISOString().slice(11, 19)}`;
  const { data: subject, error: sErr } = await a.client.from('subjects').insert({ user_id: a.id, name: subjectName, color: '#5B5BD6' }).select('id').single();
  if (sErr) throw new Error(`creating subject failed: ${sErr.message}`);
  cleanup.push(async () => a.client.from('subjects').delete().eq('id', subject.id));

  // ---- Timer: idempotent start, one-active rule, restart recovery, pause exclusion
  const sid = randomUUID();
  const s1 = await rpc(a.client, 'start_session', { p_session_id: sid, p_subject_id: subject.id, p_intention: 'verify-hosted run', p_goal_id: null });
  cleanup.push(async () => a.client.rpc('discard_session', { p_session_id: sid }));
  const s1retry = await rpc(a.client, 'start_session', { p_session_id: sid, p_subject_id: subject.id, p_intention: null, p_goal_id: null });
  check('retried start returns the same session', s1retry.session.id === sid && s1retry.session.started_at === s1.session.started_at);
  let secondStartError = null;
  try {
    await rpc(a.client, 'start_session', { p_session_id: randomUUID(), p_subject_id: subject.id, p_intention: null, p_goal_id: null });
  } catch (e) {
    secondStartError = e.message;
  }
  check('second concurrent session is rejected', /active_session_exists/.test(secondStartError ?? ''), secondStartError ?? 'no error');

  await sleep(1500);
  // "Restart": a brand-new client/session recovers the running timer from the server.
  const aRestarted = newClient();
  await aRestarted.auth.signInWithPassword({ email: a.email, password: a.password });
  const recovered = await rpc(aRestarted, 'get_active_session', {});
  check('active session recovered after "restart" (new client)', recovered.session?.id === sid && recovered.session.timer_state === 'running');
  await aRestarted.auth.signOut({ scope: 'local' });

  await rpc(a.client, 'pause_session', { p_session_id: sid, p_at: null });
  await sleep(3000);
  const pausedView = await rpc(a.client, 'get_active_session', {});
  check('paused session stays paused on the server', pausedView.session?.timer_state === 'paused');
  await rpc(a.client, 'resume_session', { p_session_id: sid });
  await sleep(1000);
  const done = (await rpc(a.client, 'finish_session', { p_session_id: sid, p_at: null })).session;
  const doneAgain = (await rpc(a.client, 'finish_session', { p_session_id: sid, p_at: null })).session;
  check('paused time excluded from duration', done.duration_seconds >= 2 && done.duration_seconds <= 4, `${done.duration_seconds}s recorded, 3s pause excluded`);
  check('finish is idempotent', doneAgain.completed_at === done.completed_at && doneAgain.duration_seconds === done.duration_seconds);
  check('finished session is private by default', done.visibility === 'private');
  cleanup.push(async () => a.client.from('study_sessions').delete().eq('id', sid));

  // ---- Photo + song + accomplishment, then share
  const sharedPhoto = await attachPhoto(a, sid);
  cleanup.push(async () => a.client.storage.from('session-photos').remove([sharedPhoto]));
  const { error: badMime } = await a.client.storage
    .from('session-photos')
    .upload(`${a.id}/${sid}/${randomUUID()}.png`, Buffer.from('not an image'), { contentType: 'text/plain' });
  check('storage rejects non-image uploads', !!badMime, badMime?.message);
  const { error: detailsErr } = await a.client
    .from('study_sessions')
    .update({
      title: 'Verify: shared session',
      accomplishment: 'Verified the hosted backend end to end.',
      mood: 'proud',
      song_title: 'Weightless',
      song_artist: 'Marconi Union',
      song_url: 'https://open.spotify.com/track/6kkwzB6hXLIONkEk9JciA6',
    })
    .eq('id', sid);
  check('accomplishment, mood and song saved', !detailsErr, detailsErr?.message);
  const { error: badSong } = await a.client.from('study_sessions').update({ song_url: 'http://evil.example/x' }).eq('id', sid);
  check('unsupported song link rejected by the database', !!badSong);
  const { error: forgeErr } = await a.client.from('study_sessions').update({ duration_seconds: 99999 }).eq('id', sid);
  check('duration cannot be edited directly', !!forgeErr, forgeErr?.code);

  const { data: followRow } = await b.client.from('follows').select('follower_id').eq('follower_id', b.id).eq('following_id', a.id);
  bFollowedBefore = followRow?.length === 1;
  if (bFollowedBefore) await b.client.from('follows').delete().eq('follower_id', b.id).eq('following_id', a.id);

  check('B cannot see A’s private session (not following)', !(await canSee(b, sid)));
  await a.client.from('study_sessions').update({ visibility: 'followers' }).eq('id', sid);
  check('B (not following) cannot see A’s shared session', !(await canSee(b, sid)));
  check('B (not following) cannot load the photo', !(await signedUrlWorks(b, sharedPhoto)));

  // ---- Follow, view, like, comment
  const { error: fErr } = await b.client.from('follows').insert({ follower_id: b.id, following_id: a.id });
  check('B follows A', !fErr, fErr?.message);
  const { error: dupFollow } = await b.client.from('follows').insert({ follower_id: b.id, following_id: a.id });
  check('duplicate follow rejected', dupFollow?.code === '23505', dupFollow?.code);
  const { error: selfFollow } = await b.client.from('follows').insert({ follower_id: b.id, following_id: b.id });
  check('self-follow rejected', !!selfFollow, selfFollow?.code);

  const { data: feed, error: feedErr } = await b.client
    .from('study_sessions')
    .select('id, author:profiles!study_sessions_user_id_fkey(username), my_like:likes(user_id)')
    .eq('status', 'completed')
    .eq('visibility', 'followers')
    .eq('my_like.user_id', b.id)
    .order('completed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);
  check('A’s shared session appears in B’s feed query', !feedErr && feed.some((r) => r.id === sid), feedErr?.message);
  check('B can load the shared photo via signed URL', await signedUrlWorks(b, sharedPhoto));

  const { error: likeErr } = await b.client.from('likes').insert({ session_id: sid, user_id: b.id });
  check('B likes the session', !likeErr, likeErr?.message);
  const { error: dupLike } = await b.client.from('likes').insert({ session_id: sid, user_id: b.id });
  check('duplicate like rejected', dupLike?.code === '23505', dupLike?.code);
  const commentId = randomUUID();
  const { error: cErr } = await b.client.from('comments').insert({ id: commentId, session_id: sid, user_id: b.id, body: 'Nice work! (verify-hosted)' });
  check('B comments on the session', !cErr, cErr?.message);

  const { data: aView } = await a.client
    .from('study_sessions')
    .select('like_count, comment_count, likes(user_id), comments(user_id, body)')
    .eq('id', sid)
    .single();
  check(
    'A sees B’s like and comment (persisted)',
    aView?.like_count === 1 && aView?.comment_count === 1 && aView.likes.some((l) => l.user_id === b.id) && aView.comments.some((c) => c.user_id === b.id),
    `likes=${aView?.like_count} comments=${aView?.comment_count}`,
  );

  // ---- Notifications (generated by the database, private to the recipient)
  const aNotes = await notificationsOf(a);
  check('A is notified that B followed', aNotes.some((n) => n.kind === 'follow' && n.actor.id === b.id));
  check('A is notified of B’s like (links to the session)', aNotes.some((n) => n.kind === 'like' && n.session_id === sid && n.actor.id === b.id));
  check(
    'A is notified of B’s comment with an excerpt',
    aNotes.some((n) => n.kind === 'comment' && n.session_id === sid && /verify-hosted/.test(n.comment_excerpt ?? '')),
  );
  const { data: bReadsA } = await b.client.from('notifications').select('id').eq('recipient_id', a.id);
  check('B cannot read A’s notifications', (bReadsA ?? []).length === 0);
  const { error: forgedNote } = await b.client
    .from('notifications')
    .insert({ recipient_id: a.id, actor_id: b.id, kind: 'follow', dedupe_key: `forged:${randomUUID()}` });
  check('clients cannot create notifications', !!forgedNote, forgedNote?.code);

  // ---- Profile highlight (read-only; respects whichever statistic A chose)
  const range2 = (() => {
    const s0 = weekStart();
    return { p_week_start: s0.toISOString(), p_week_end: new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + 7).toISOString() };
  })();
  const aHigh = await rpc(a.client, 'get_profile_highlight', { p_user_id: a.id, ...range2 });
  const bHigh = await rpc(b.client, 'get_profile_highlight', { p_user_id: a.id, ...range2 });
  if (!aHigh) {
    check('B gets no highlight when A hides it', bHigh === null);
  } else if (aHigh.kind === 'wins_week') {
    check('milestone wins are visible only to A', bHigh === null);
  } else if (aHigh.kind === 'hours_week' || aHigh.kind === 'sessions_week') {
    const mine = await weekTotals(a);
    const { data: sharedRows } = await b.client
      .from('study_sessions')
      .select('id, duration_seconds')
      .eq('user_id', a.id)
      .eq('status', 'completed')
      .gte('started_at', range2.p_week_start)
      .lt('started_at', range2.p_week_end);
    const sharedSecs = (sharedRows ?? []).reduce((t, r) => t + r.duration_seconds, 0);
    const expectA = aHigh.kind === 'hours_week' ? mine.seconds : mine.count;
    const expectB = aHigh.kind === 'hours_week' ? sharedSecs : (sharedRows ?? []).length;
    check(`A’s ${aHigh.kind} includes private sessions`, Number(aHigh.value) === expectA, `${aHigh.value} vs ${expectA}`);
    check(`B’s ${aHigh.kind} counts only sessions shared with B`, Number(bHigh?.value) === expectB && bHigh?.scope === 'shared', `${bHigh?.value} vs ${expectB}`);
  } else {
    check('B receives a shared-only lifetime figure', bHigh === null || bHigh.scope === 'shared');
  }

  // ---- Study buddies (invite → accept → privacy)
  let selfInviteErr = null;
  try {
    await rpc(a.client, 'invite_study_buddies', { p_session_id: sid, p_buddy_ids: [a.id] });
  } catch (e) {
    selfInviteErr = e.message;
  }
  check('A cannot invite themselves as a study buddy', /cannot_invite_self/.test(selfInviteErr ?? ''), selfInviteErr ?? 'no error');
  await rpc(a.client, 'invite_study_buddies', { p_session_id: sid, p_buddy_ids: [b.id] });
  await rpc(a.client, 'invite_study_buddies', { p_session_id: sid, p_buddy_ids: [b.id] }); // retry
  const { data: inviteRows } = await a.client.from('study_buddies').select('id, status').eq('session_id', sid).eq('buddy_id', b.id);
  check('inviting twice creates one invitation', inviteRows?.length === 1 && inviteRows[0].status === 'pending');
  const inviteId = inviteRows?.[0]?.id;
  const bInvite = (await notificationsOf(b)).find((n) => n.kind === 'buddy_invite' && n.invite_id === inviteId);
  check('B receives the invitation notification', bInvite?.invite_status === 'pending' && bInvite?.session_id === sid);
  const { error: directBuddy } = await b.client.from('study_buddies').update({ status: 'accepted' }).eq('id', inviteId);
  check('invitations cannot be accepted by editing rows directly', !!directBuddy, directBuddy?.code);
  await rpc(b.client, 'respond_study_buddy', { p_invite_id: inviteId, p_accept: true });
  const { data: cardBuddies } = await b.client.from('study_sessions').select('id, buddies:study_buddies(status, buddy_id)').eq('id', sid).single();
  check('accepted buddy is shown on the post', (cardBuddies?.buddies ?? []).some((x) => x.buddy_id === b.id && x.status === 'accepted'));
  check('A is told B accepted', (await notificationsOf(a)).some((n) => n.kind === 'buddy_accepted' && n.invite_id === inviteId));
  await a.client.from('study_sessions').update({ visibility: 'private' }).eq('id', sid);
  check('making the post private hides it from the buddy', !(await canSee(b, sid)));
  await a.client.from('study_sessions').update({ visibility: 'followers' }).eq('id', sid);
  await rpc(a.client, 'remove_study_buddy', { p_invite_id: inviteId });
  await rpc(a.client, 'invite_study_buddies', { p_session_id: sid, p_buddy_ids: [b.id] });
  await a.client.from('study_sessions').update({ visibility: 'private' }).eq('id', sid);
  const { data: revoked } = await a.client.from('study_buddies').select('status').eq('session_id', sid).eq('buddy_id', b.id).single();
  await a.client.from('study_sessions').update({ visibility: 'followers' }).eq('id', sid);
  const { data: stillRevoked } = await a.client.from('study_buddies').select('id, status').eq('session_id', sid).eq('buddy_id', b.id).single();
  check('going private revokes pending invitations; re-sharing doesn’t revive them', revoked?.status === 'revoked' && stillRevoked?.status === 'revoked');
  if (stillRevoked?.id) await rpc(a.client, 'remove_study_buddy', { p_invite_id: stillRevoked.id });

  // ---- Profile note (status): followers only, 24 h. Never overwrites a real note.
  const { data: existingNote } = await a.client.from('profile_statuses').select('user_id').eq('user_id', a.id);
  if ((existingNote ?? []).length > 0) {
    skip('profile note checks', 'A has an active note; clear it in the app to run these');
  } else {
    const note = await rpc(a.client, 'set_status', { p_emoji: '🧪', p_body: 'verify-hosted note' });
    cleanup.push(async () => a.client.rpc('clear_status'));
    const hours = (Date.parse(note.expires_at) - Date.parse(note.updated_at)) / 36e5;
    check('note expires 24 h after saving', Math.abs(hours - 24) < 0.01, `${hours.toFixed(2)} h`);
    const { data: bNote } = await b.client.from('profile_statuses').select('body').eq('user_id', a.id);
    check('follower B can read A’s note', bNote?.[0]?.body === 'verify-hosted note');
    let longErr = null;
    try {
      await rpc(a.client, 'set_status', { p_emoji: null, p_body: 'x'.repeat(101) });
    } catch (e) {
      longErr = e.message;
    }
    check('notes over 100 characters are rejected', /status_too_long/.test(longErr ?? ''));
    await b.client.from('follows').delete().eq('follower_id', b.id).eq('following_id', a.id);
    const { data: bNoteAfter } = await b.client.from('profile_statuses').select('body').eq('user_id', a.id);
    check('after unfollowing, B can no longer read A’s note', (bNoteAfter ?? []).length === 0);
    await b.client.from('follows').insert({ follower_id: b.id, following_id: a.id });
    await rpc(a.client, 'clear_status', {});
  }

  // ---- Private session: B must not get it by any route
  const priv = await createCompletedSession(a, subject.id);
  cleanup.push(async () => a.client.from('study_sessions').delete().eq('id', priv.id));
  const privPhoto = await attachPhoto(a, priv.id);
  cleanup.push(async () => a.client.storage.from('session-photos').remove([privPhoto]));
  check('B cannot read A’s private session (direct request)', !(await canSee(b, priv.id)));
  check('B cannot load A’s private photo', !(await signedUrlWorks(b, privPhoto)));
  check('A can load A’s own private photo', await signedUrlWorks(a, privPhoto));
  const { error: privLike } = await b.client.from('likes').insert({ session_id: priv.id, user_id: b.id });
  check('B cannot like A’s private session', !!privLike, privLike?.code);
  const { error: privComment } = await b.client.from('comments').insert({ session_id: priv.id, user_id: b.id, body: 'x' });
  check('B cannot comment on A’s private session', !!privComment, privComment?.code);
  const { data: hijack } = await b.client.from('study_sessions').update({ visibility: 'followers' }).eq('id', priv.id).select('id');
  check('B cannot change A’s session visibility', !hijack || hijack.length === 0);
  const { data: bSubjects } = await b.client.from('subjects').select('id').eq('user_id', a.id);
  check('B cannot read A’s subjects', (bSubjects ?? []).length === 0);

  // ---- Progress totals include both sessions (private + shared)
  const withBoth = await weekTotals(a);
  check(
    'A’s weekly totals include both new sessions',
    withBoth.count === before.count + 2 && withBoth.seconds === before.seconds + done.duration_seconds + priv.duration_seconds,
    `${before.count}→${withBoth.count} sessions`,
  );

  // ---- Visibility change removes access
  await a.client.from('study_sessions').update({ visibility: 'private' }).eq('id', sid);
  check('switching to "Only me" hides the session from B', !(await canSee(b, sid)));
  check('…and hides its photo from B', !(await signedUrlWorks(b, sharedPhoto)));
  const { data: hiddenComments } = await b.client.from('comments').select('id').eq('session_id', sid);
  check('…and hides its comments from B', (hiddenComments ?? []).length === 0);
  check('private sessions still count toward A’s totals', (await weekTotals(a)).count === withBoth.count);
  await a.client.from('study_sessions').update({ visibility: 'followers' }).eq('id', sid);

  // ---- Unfollow removes access
  await b.client.from('follows').delete().eq('follower_id', b.id).eq('following_id', a.id);
  check('unfollowing removes access to followers-only sessions', !(await canSee(b, sid)));
  await b.client.from('follows').insert({ follower_id: b.id, following_id: a.id });

  // ---- Delete removes it everywhere
  const { error: delErr } = await a.client.from('study_sessions').delete().eq('id', sid);
  await a.client.storage.from('session-photos').remove([sharedPhoto]);
  check('A deletes the shared session', !delErr, delErr?.message);
  check('deleted session gone for B', !(await canSee(b, sid)));
  check('deleted session gone for A', !(await canSee(a, sid)));
  const afterDelete = await weekTotals(a);
  check('A’s totals drop after deleting', afterDelete.count === withBoth.count - 1 && afterDelete.seconds === withBoth.seconds - done.duration_seconds);
} catch (e) {
  check('run completed without unexpected errors', false, e.message);
} finally {
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch {
      /* best effort */
    }
  }
  if (a && b && bFollowedBefore !== null) {
    await b.client.from('follows').delete().eq('follower_id', b.id).eq('following_id', a.id);
    if (bFollowedBefore) await b.client.from('follows').insert({ follower_id: b.id, following_id: a.id });
  }
  for (const u of [a, b]) await u?.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Test data cleaned up.`);
  process.exit(failed ? 1 : 0);
}
