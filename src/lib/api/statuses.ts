import { PROFILE_SUMMARY } from '@/lib/api/profiles';
import { supabase } from '@/lib/supabase';
import type { NoteWithAuthor, ProfileStatus } from '@/lib/types';
import { isStatusActive } from '@/lib/status';

/**
 * Short profile statuses ("notes"). RLS returns only unexpired statuses of
 * the caller and the people they follow; expiry is also re-checked here so a
 * status that expires while the screen is open disappears on the next render.
 */
const STATUS_COLUMNS = 'user_id, emoji, body, updated_at, expires_at';

export async function fetchStatus(userId: string): Promise<ProfileStatus | null> {
  const { data, error } = await supabase.from('profile_statuses').select(STATUS_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const status = data as ProfileStatus | null;
  return status && isStatusActive(status) ? status : null;
}

/** Notes for the Feed: mine first, then people I follow, most recent first. */
export async function fetchFeedNotes(myId: string): Promise<NoteWithAuthor[]> {
  const { data, error } = await supabase
    .from('profile_statuses')
    .select(`${STATUS_COLUMNS}, author:profiles!profile_statuses_user_id_fkey(${PROFILE_SUMMARY})`)
    .gt('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const notes = (data ?? [])
    .map((row: any) => ({ ...row, author: Array.isArray(row.author) ? row.author[0] : row.author }))
    .filter((n: NoteWithAuthor) => n.author && isStatusActive(n)) as NoteWithAuthor[];
  return [...notes.filter((n) => n.user_id === myId), ...notes.filter((n) => n.user_id !== myId)];
}

export async function saveStatus(input: { emoji: string | null; body: string | null }): Promise<ProfileStatus> {
  const { data, error } = await supabase.rpc('set_status', { p_emoji: input.emoji, p_body: input.body });
  if (error) throw error;
  return data as ProfileStatus;
}

export async function clearStatus(): Promise<void> {
  const { error } = await supabase.rpc('clear_status');
  if (error) throw error;
}
