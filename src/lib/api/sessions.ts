import type { Mood } from '@/constants/moods';
import { PROFILE_SUMMARY } from '@/lib/api/profiles';
import { removeObject } from '@/lib/api/storage';
import { supabase } from '@/lib/supabase';
import { computeClockOffsetMs } from '@/lib/timer';
import type { CompletedSession, SessionCardData, StudySession, TimerPayload, Visibility } from '@/lib/types';
import type { WeekRange } from '@/lib/week';

// ---------------------------------------------------------------------------
// Timer RPCs (server clock, idempotent — see supabase/migrations/*_session_functions.sql)
// ---------------------------------------------------------------------------

export type TimerResult = { session: StudySession | null; offsetMs: number };

async function callTimer(fn: string, args: Record<string, unknown>): Promise<TimerResult> {
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc(fn, args);
  const receivedAt = Date.now();
  if (error) throw error;
  const payload = data as TimerPayload;
  return {
    session: payload.session ?? null,
    offsetMs: computeClockOffsetMs(payload.server_now, startedAt, receivedAt),
  };
}

export const timerApi = {
  getActive: () => callTimer('get_active_session', {}),
  start: (args: { id: string; subjectId: string; intention: string | null; goalId: string | null }) =>
    callTimer('start_session', {
      p_session_id: args.id,
      p_subject_id: args.subjectId,
      p_intention: args.intention,
      p_goal_id: args.goalId,
    }),
  pause: (id: string, at: string | null) => callTimer('pause_session', { p_session_id: id, p_at: at }),
  resume: (id: string) => callTimer('resume_session', { p_session_id: id }),
  finish: (id: string, at: string | null) => callTimer('finish_session', { p_session_id: id, p_at: at }),
  discard: async (id: string) => {
    const { error } = await supabase.rpc('discard_session', { p_session_id: id });
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// Reading sessions
// ---------------------------------------------------------------------------

const CARD_SELECT = `
  id, user_id, subject_id, subject_name, subject_color, goal_id, status, timer_state, intention,
  started_at, running_since, accumulated_ms, ended_at, duration_seconds, completed_at, title,
  accomplishment, mood, photo_path, song_title, song_artist, song_url, visibility, like_count,
  comment_count, created_at, updated_at,
  author:profiles!study_sessions_user_id_fkey(${PROFILE_SUMMARY}),
  my_like:likes(user_id),
  buddies:study_buddies(id, status, created_at, buddy:profiles!study_buddies_buddy_id_fkey(${PROFILE_SUMMARY}))
`;

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function toCard(row: any): SessionCardData {
  const { my_like, author, buddies, ...rest } = row;
  return {
    ...rest,
    author: one(author),
    liked_by_me: Array.isArray(my_like) && my_like.length > 0,
    // RLS shows other viewers accepted buddies only; the owner also receives
    // pending rows, which must never be displayed as collaborators.
    buddies: (Array.isArray(buddies) ? buddies : [])
      .filter((b: any) => b?.status === 'accepted' && one(b.buddy))
      .sort((x: any, y: any) => String(x.created_at).localeCompare(String(y.created_at)))
      .map((b: any) => ({ inviteId: b.id, profile: one(b.buddy)! })),
  };
}

export type Cursor = { completedAt: string; id: string } | null;

export type Page<T> = { items: T[]; nextCursor: Cursor };

const PAGE_SIZE = 15;

function applyCursor<Q extends { or: (filter: string) => Q }>(query: Q, cursor: Cursor): Q {
  if (!cursor) return query;
  // Keyset pagination on (completed_at desc, id desc): stable even while new
  // sessions are being shared, so pages never overlap or skip items.
  const t = `"${cursor.completedAt}"`;
  return query.or(`completed_at.lt.${t},and(completed_at.eq.${t},id.lt.${cursor.id})`);
}

function toPage(rows: any[]): Page<SessionCardData> {
  const items = rows.map(toCard);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: items.length === PAGE_SIZE && last ? { completedAt: last.completed_at, id: last.id } : null,
  };
}

/**
 * Feed: shared sessions from me and the people I follow. RLS limits rows to
 * those; the visibility filter keeps my own private sessions out of the feed.
 */
export async function fetchFeedPage(myId: string, cursor: Cursor): Promise<Page<SessionCardData>> {
  let query = supabase
    .from('study_sessions')
    .select(CARD_SELECT)
    .eq('status', 'completed')
    .eq('visibility', 'followers')
    .eq('my_like.user_id', myId);
  query = applyCursor(query, cursor);
  const { data, error } = await query
    .order('completed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw error;
  return toPage(data ?? []);
}

/** Sessions on a profile. Others only ever receive shared sessions (RLS). */
export async function fetchUserSessionsPage(
  myId: string,
  userId: string,
  cursor: Cursor,
  opts: { includePrivate?: boolean } = {},
): Promise<Page<SessionCardData>> {
  let query = supabase
    .from('study_sessions')
    .select(CARD_SELECT)
    .eq('status', 'completed')
    .eq('user_id', userId)
    .eq('my_like.user_id', myId);
  if (!opts.includePrivate) query = query.eq('visibility', 'followers');
  query = applyCursor(query, cursor);
  const { data, error } = await query
    .order('completed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw error;
  return toPage(data ?? []);
}

export async function fetchSessionCard(myId: string, sessionId: string): Promise<SessionCardData | null> {
  const { data, error } = await supabase
    .from('study_sessions')
    .select(CARD_SELECT)
    .eq('id', sessionId)
    .eq('status', 'completed')
    .eq('my_like.user_id', myId)
    .maybeSingle();
  if (error) throw error;
  return data ? toCard(data) : null;
}

/** All of my completed sessions that started inside the week (private + shared). */
export async function fetchMyWeekSessions(myId: string, week: WeekRange): Promise<CompletedSession[]> {
  const { data, error } = await supabase
    .from('study_sessions')
    .select(
      'id, user_id, subject_id, subject_name, subject_color, goal_id, status, started_at, duration_seconds, completed_at, title, accomplishment, mood, visibility',
    )
    .eq('user_id', myId)
    .eq('status', 'completed')
    .gte('started_at', week.start.toISOString())
    .lt('started_at', week.end.toISOString())
    .order('started_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as CompletedSession[];
}

// ---------------------------------------------------------------------------
// Editing completed sessions
// ---------------------------------------------------------------------------

export type SessionDetailsPatch = {
  title: string;
  accomplishment: string | null;
  mood: Mood | null;
  photo_path: string | null;
  song_title: string | null;
  song_artist: string | null;
  song_url: string | null;
  visibility: Visibility;
  goal_id: string | null;
};

export async function updateSessionDetails(id: string, patch: Partial<SessionDetailsPatch>): Promise<void> {
  const { data, error } = await supabase.from('study_sessions').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('session_not_found');
}

/**
 * Deletes a session (likes and comments cascade in the database), then removes
 * its photo from storage. If the photo removal fails the object stays private
 * to the owner: no session references it, so nobody else can read it.
 */
export async function deleteSession(session: Pick<StudySession, 'id' | 'photo_path'>): Promise<void> {
  const { error } = await supabase.from('study_sessions').delete().eq('id', session.id);
  if (error) throw error;
  if (session.photo_path) {
    await removeObject('session-photos', session.photo_path).catch(() => undefined);
  }
}
