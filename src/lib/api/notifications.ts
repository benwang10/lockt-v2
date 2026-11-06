import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types';

export type NotificationCursor = { createdAt: string; id: string } | null;

export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Newest first; targets the reader can no longer see come back null (server-side). */
export async function fetchNotificationsPage(
  cursor: NotificationCursor,
): Promise<{ items: AppNotification[]; nextCursor: NotificationCursor }> {
  const { data, error } = await supabase.rpc('list_notifications', {
    p_before_created_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: NOTIFICATIONS_PAGE_SIZE,
  });
  if (error) throw error;
  const items = (data ?? []) as AppNotification[];
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: items.length === NOTIFICATIONS_PAGE_SIZE && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
}
