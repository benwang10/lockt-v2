import { PROFILE_SUMMARY } from '@/lib/api/profiles';
import { supabase } from '@/lib/supabase';
import type { BuddyInvite } from '@/lib/types';

/**
 * Study-buddy invitations. Every transition is a database RPC that checks
 * ownership, visibility and follow requirements (see
 * supabase/migrations/20261104000400_study_buddies.sql).
 */

const INVITE_SELECT = `id, session_id, owner_id, buddy_id, status, created_at, responded_at,
  buddy:profiles!study_buddies_buddy_id_fkey(${PROFILE_SUMMARY})`;

function toInvite(row: any): BuddyInvite {
  return { ...row, buddy: Array.isArray(row.buddy) ? row.buddy[0] : row.buddy };
}

/** All invitations on a session the caller owns (RLS returns only accepted ones to others). */
export async function fetchSessionInvites(sessionId: string): Promise<BuddyInvite[]> {
  const { data, error } = await supabase
    .from('study_buddies')
    .select(INVITE_SELECT)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toInvite);
}

/** The caller's own invitation on a session (as invitee), if any. */
export async function fetchMyInvite(sessionId: string, myId: string): Promise<BuddyInvite | null> {
  const { data, error } = await supabase
    .from('study_buddies')
    .select(INVITE_SELECT)
    .eq('session_id', sessionId)
    .eq('buddy_id', myId)
    .maybeSingle();
  if (error) throw error;
  return data ? toInvite(data) : null;
}

export async function inviteBuddies(sessionId: string, buddyIds: string[]): Promise<void> {
  if (buddyIds.length === 0) return;
  const { error } = await supabase.rpc('invite_study_buddies', { p_session_id: sessionId, p_buddy_ids: buddyIds });
  if (error) throw error;
}

export async function respondToInvite(inviteId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_study_buddy', { p_invite_id: inviteId, p_accept: accept });
  if (error) throw error;
}

/** Owner removes an invitation/buddy, or an accepted buddy removes themselves. */
export async function removeBuddy(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_study_buddy', { p_invite_id: inviteId });
  if (error) throw error;
}
