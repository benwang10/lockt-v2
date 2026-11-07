import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Banner, EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { MAX_CONTENT_WIDTH, Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { respondToInvite } from '@/lib/api/buddies';
import {
  fetchNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCursor,
} from '@/lib/api/notifications';
import { followUser } from '@/lib/api/profiles';
import { friendlyError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import { presentNotification } from '@/lib/notifications';
import { formatRelativeTime } from '@/lib/time';
import type { AppNotification } from '@/lib/types';
import { useMe } from '@/providers/auth';
import { makeStyles, useTheme } from '@/providers/theme';
import { useToast } from '@/providers/toast';
import { useSingleSubmit } from '@/hooks/use-single-submit';

type State = {
  items: AppNotification[];
  cursor: NotificationCursor;
  hasMore: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
};

const INITIAL: State = {
  items: [],
  cursor: null,
  hasMore: true,
  loading: true,
  refreshing: false,
  loadingMore: false,
  error: null,
  loadMoreError: null,
};

function dedupe(list: AppNotification[]) {
  const seen = new Set<string>();
  return list.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userId } = useMe();
  const toast = useToast();
  const [state, setState] = useState<State>(INITIAL);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const generation = useRef(0);

  const loadFirst = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const gen = ++generation.current;
    if (mode === 'refresh') setState((s) => ({ ...s, refreshing: true }));
    try {
      const page = await fetchNotificationsPage(null);
      if (gen !== generation.current) return;
      setState((s) => ({
        ...s,
        items: dedupe(page.items),
        cursor: page.nextCursor,
        hasMore: !!page.nextCursor,
        error: null,
        loadMoreError: null,
        loading: false,
        refreshing: false,
      }));
    } catch (e) {
      if (gen !== generation.current) return;
      setState((s) => ({ ...s, error: friendlyError(e), loading: false, refreshing: false }));
    }
  }, []);

  // Refresh every time the screen opens or regains focus.
  useFocusEffect(
    useCallback(() => {
      loadFirst('silent');
    }, [loadFirst]),
  );

  const loadMore = async () => {
    if (!state.hasMore || !state.cursor || state.loadingMore || state.loading || state.refreshing) return;
    const gen = generation.current;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const page = await fetchNotificationsPage(state.cursor);
      if (gen !== generation.current) return;
      setState((s) => ({
        ...s,
        items: dedupe([...s.items, ...page.items]),
        cursor: page.nextCursor,
        hasMore: !!page.nextCursor,
        loadMoreError: null,
        loadingMore: false,
      }));
    } catch (e) {
      setState((s) => ({ ...s, loadMoreError: friendlyError(e), loadingMore: false }));
    }
  };

  const setRead = (ids: string[] | 'all') =>
    setState((s) => ({
      ...s,
      items: s.items.map((n) =>
        ids === 'all' || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n,
      ),
    }));

  const markAll = useSingleSubmit(async () => {
    const before = state.items;
    setRead('all');
    try {
      await markAllNotificationsRead();
      invalidate('notifications');
    } catch (e) {
      setState((s) => ({ ...s, items: before }));
      toast(friendlyError(e), 'error');
    }
  });

  const open = (n: AppNotification) => {
    if (!n.read_at) {
      setRead([n.id]);
      markNotificationRead(n.id)
        .then(() => invalidate('notifications'))
        .catch(() => undefined);
    }
    // Destinations never point at content the reader can't see; if access is
    // lost after this list loaded, the session screen shows its unavailable state.
    router.push(presentNotification(n).destination);
  };

  const act = async (n: AppNotification, action: 'accept' | 'decline' | 'follow') => {
    if (busy[n.id]) return;
    setBusy((b) => ({ ...b, [n.id]: true }));
    try {
      if (action === 'follow') {
        await followUser(userId, n.actor.id);
        invalidate('social');
        toast(`You now follow @${n.actor.username}. You can accept the invitation.`);
      } else {
        await respondToInvite(n.invite_id!, action === 'accept');
        invalidate('sessions');
        toast(action === 'accept' ? 'You’re a study buddy on this session.' : 'Invitation declined.');
      }
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy((b) => ({ ...b, [n.id]: false }));
      invalidate('notifications');
      loadFirst('silent');
    }
  };

  const unread = state.items.some((n) => !n.read_at);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerRight: unread ? () => <Button title="Mark all read" variant="ghost" size="sm" onPress={markAll} /> : undefined,
        }}
      />
      {state.loading ? (
        <LoadingState label="Loading notifications…" />
      ) : state.error && state.items.length === 0 ? (
        <ErrorState message={state.error} onRetry={() => loadFirst('refresh')} />
      ) : (
        <FlatList
          data={state.items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={state.refreshing} onRefresh={() => loadFirst('refresh')} tintColor={colors.accent} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            state.error ? (
              <View style={[styles.column, styles.headerBanner]}>
                <Banner tone="danger" message={state.error} actionLabel="Retry" onAction={() => loadFirst('refresh')} />
              </View>
            ) : undefined
          }
          renderItem={({ item }) => (
            <View style={styles.column}>
              <NotificationRow notification={item} busy={!!busy[item.id]} onOpen={() => open(item)} onAct={(a) => act(item, a)} />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="bell"
              title="No notifications yet"
              message="When someone follows you, likes or comments on your sessions, or invites you as a study buddy, it shows up here."
            />
          }
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator style={styles.footer} color={colors.accent} />
            ) : state.loadMoreError ? (
              <View style={[styles.column, styles.footer]}>
                <Banner tone="danger" message={state.loadMoreError} actionLabel="Retry" onAction={loadMore} />
              </View>
            ) : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}

function NotificationRow({
  notification: n,
  busy,
  onOpen,
  onAct,
}: {
  notification: AppNotification;
  busy: boolean;
  onOpen: () => void;
  onAct: (action: 'accept' | 'decline' | 'follow') => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const view = presentNotification(n);
  const unread = !n.read_at;
  return (
    <View style={[styles.row, unread && styles.rowUnread]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? 'Unread. ' : ''}${n.actor.display_name} ${view.action}. ${view.detail ?? ''} ${formatRelativeTime(n.created_at)}`}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.75 }]}>
        <Avatar path={n.actor.avatar_path} name={n.actor.display_name} seed={n.actor.id} size={42} />
        <View style={styles.text}>
          <AppText variant="small">
            <AppText variant="smallStrong">{n.actor.display_name}</AppText> {view.action}
          </AppText>
          {view.detail ? (
            <AppText variant="small" color={view.stale ? colors.textMuted : colors.textSecondary} numberOfLines={2}>
              {view.detail}
            </AppText>
          ) : null}
          <AppText variant="caption" color={colors.textMuted}>
            {formatRelativeTime(n.created_at)}
          </AppText>
        </View>
        {unread ? <View style={styles.dot} accessibilityElementsHidden /> : null}
      </Pressable>
      {view.invite === 'respond' ? (
        <View style={styles.actions}>
          <Button title="Accept" size="sm" onPress={() => onAct('accept')} loading={busy} style={styles.flex} />
          <Button title="Decline" size="sm" variant="secondary" onPress={() => onAct('decline')} disabled={busy} style={styles.flex} />
        </View>
      ) : view.invite === 'follow-to-accept' ? (
        <View style={styles.actions}>
          <Button
            title={`Follow @${n.actor.username}`}
            size="sm"
            icon="followAdd"
            onPress={() => onAct('follow')}
            loading={busy}
            style={styles.flex}
          />
          <Button title="Decline" size="sm" variant="secondary" onPress={() => onAct('decline')} disabled={busy} style={styles.flex} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  list: { padding: Spacing.lg, paddingBottom: Spacing.xxxl, flexGrow: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  headerBanner: { marginBottom: Spacing.md },
  separator: { height: Spacing.sm },
  row: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  rowUnread: { backgroundColor: c.accentSoft, borderColor: c.accentSoft },
  main: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, minHeight: TOUCH_TARGET },
  text: { flex: 1, gap: Spacing.xxs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent, marginTop: 6 },
  actions: { flexDirection: 'row', gap: Spacing.sm, paddingLeft: 42 + Spacing.md },
  flex: { flex: 1 },
  footer: { marginTop: Spacing.lg },
}));
