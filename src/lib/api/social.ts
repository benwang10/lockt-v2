import { PROFILE_SUMMARY } from '@/lib/api/profiles';
import { supabase } from '@/lib/supabase';
import type { Comment } from '@/lib/types';

export async function likeSession(sessionId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('likes').insert({ session_id: sessionId, user_id: userId });
  // A duplicate means it is already liked — the desired end state.
  if (error && error.code !== '23505') throw error;
}

export async function unlikeSession(sessionId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('likes').delete().eq('session_id', sessionId).eq('user_id', userId);
  if (error) throw error;
}

export async function fetchComments(sessionId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(`id, session_id, user_id, body, created_at, author:profiles!comments_user_id_fkey(${PROFILE_SUMMARY})`)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    author: Array.isArray(row.author) ? row.author[0] : row.author,
  })) as Comment[];
}

/** Client-generated id makes retries safe: a duplicate insert means it was saved. */
export async function addComment(input: { id: string; sessionId: string; userId: string; body: string }): Promise<void> {
  const { error } = await supabase.from('comments').insert({
    id: input.id,
    session_id: input.sessionId,
    user_id: input.userId,
    body: input.body.trim(),
  });
  if (error && error.code !== '23505') throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { data, error } = await supabase.from('comments').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("That comment couldn't be deleted.");
}
