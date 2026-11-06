import { supabase } from '@/lib/supabase';
import type { HighlightStat, HighlightValue, Profile, ProfileSummary, UserSettings, Visibility } from '@/lib/types';
import type { WeekRange } from '@/lib/week';

const PROFILE_COLUMNS = 'id, username, display_name, bio, avatar_path, created_at, highlight_stat';
export const PROFILE_SUMMARY = 'id, username, display_name, avatar_path';

export async function fetchProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('username', username.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function isUsernameAvailable(username: string, exceptUserId?: string): Promise<boolean> {
  const existing = await fetchProfileByUsername(username);
  return !existing || existing.id === exceptUserId;
}

export async function createProfile(input: {
  id: string;
  username: string;
  display_name: string;
  bio?: string | null;
}): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: input.id,
      username: input.username.trim().toLowerCase(),
      display_name: input.display_name.trim(),
      bio: input.bio?.trim() || null,
    })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'username' | 'display_name' | 'bio' | 'avatar_path' | 'highlight_stat'>>,
): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select(PROFILE_COLUMNS).single();
  if (error) throw error;
  return data as Profile;
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  const { data, error } = await supabase.rpc('search_profiles', { p_query: query, p_limit: 25 });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

export async function fetchFollowingIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId).limit(1000);
  if (error) throw error;
  return new Set((data ?? []).map((r: { following_id: string }) => r.following_id));
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function followUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
  // Already following (e.g. double tap / retry) is fine.
  if (error && error.code !== '23505') throw error;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw error;
}

export async function fetchConnections(
  userId: string,
  kind: 'followers' | 'following',
): Promise<ProfileSummary[]> {
  const query =
    kind === 'followers'
      ? supabase
          .from('follows')
          .select(`created_at, profile:profiles!follows_follower_id_fkey(${PROFILE_SUMMARY})`)
          .eq('following_id', userId)
      : supabase
          .from('follows')
          .select(`created_at, profile:profiles!follows_following_id_fkey(${PROFILE_SUMMARY})`)
          .eq('follower_id', userId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => (Array.isArray(row.profile) ? row.profile[0] : row.profile))
    .filter(Boolean) as ProfileSummary[];
}

export async function fetchSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_id, remember_visibility, last_visibility')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserSettings | null) ?? { user_id: userId, remember_visibility: false, last_visibility: 'private' };
}

export async function updateSettings(
  userId: string,
  patch: { remember_visibility: boolean; last_visibility: Visibility },
): Promise<void> {
  const { error } = await supabase.from('user_settings').update(patch).eq('user_id', userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Profile highlight statistic (computed server-side under the caller's RLS)
// ---------------------------------------------------------------------------

export async function fetchHighlight(userId: string, week: WeekRange): Promise<HighlightValue | null> {
  const { data, error } = await supabase.rpc('get_profile_highlight', {
    p_user_id: userId,
    p_week_start: week.start.toISOString(),
    p_week_end: week.end.toISOString(),
  });
  if (error) throw error;
  if (!data) return null;
  const raw = data as { kind: HighlightValue['kind']; value: number | string; scope: HighlightValue['scope'] };
  return { kind: raw.kind, value: Number(raw.value) || 0, scope: raw.scope };
}

export async function updateHighlightStat(userId: string, highlight: HighlightStat): Promise<Profile> {
  return updateProfile(userId, { highlight_stat: highlight });
}
