import { router } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveSessionBanner } from '@/components/active-session-banner';
import { NotesRow } from '@/components/notes-row';
import { SessionCard } from '@/components/session-card';
import { Button, IconButton } from '@/components/ui/button';
import { Banner, EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { APP_NAME } from '@/constants/brand';
import { MAX_CONTENT_WIDTH, Spacing } from '@/constants/theme';
import { useLikeToggle } from '@/hooks/use-like-toggle';
import { usePagedSessions } from '@/hooks/use-paged-sessions';
import { useQuery } from '@/hooks/use-query';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { fetchFeedNotes } from '@/lib/api/statuses';
import { fetchFeedPage } from '@/lib/api/sessions';
import type { SessionCardData } from '@/lib/types';
import { useMe } from '@/providers/auth';
import { makeStyles, useTheme } from '@/providers/theme';

export default function FeedScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userId, profile } = useMe();
  const feed = usePagedSessions((cursor) => fetchFeedPage(userId, cursor), [userId]);
  // Notes are secondary: if they fail to load the strip simply shows my add button.
  const notes = useQuery(() => fetchFeedNotes(userId).catch(() => []), [userId], { topics: ['status', 'social'] });
  const unread = useUnreadNotifications();
  const toggleLike = useLikeToggle(feed.updateItem);

  const renderItem = useCallback(
    ({ item }: { item: SessionCardData }) => (
      <View style={styles.column}>
        <SessionCard session={item} onToggleLike={toggleLike} />
      </View>
    ),
    [toggleLike, styles],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {APP_NAME}
        </AppText>
        <View style={styles.headerActions}>
          <IconButton icon="search" label="Find friends" onPress={() => router.push('/search')} />
          <IconButton
            icon={unread > 0 ? 'bellBadge' : 'bell'}
            label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            onPress={() => router.push('/notifications')}>
            {unread > 0 ? <View style={styles.unreadDot} /> : null}
          </IconButton>
        </View>
      </View>

      {feed.loading ? (
        <LoadingState label="Loading your feed…" />
      ) : feed.error && feed.items.length === 0 ? (
        <ErrorState message={feed.error} onRetry={feed.retry} />
      ) : (
        <FlatList
          data={feed.items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.lg }} />}
          refreshControl={
            <RefreshControl
              refreshing={feed.refreshing}
              onRefresh={() => {
                feed.refresh();
                notes.refresh();
              }}
              tintColor={colors.accent}
            />
          }
          onEndReached={feed.loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View style={[styles.column, styles.listHeader]}>
              <NotesRow me={profile} notes={notes.data ?? []} />
              <ActiveSessionBanner />
              {feed.error ? <Banner tone="danger" message={feed.error} actionLabel="Retry" onAction={feed.refresh} /> : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="people"
              title="Your feed is quiet"
              message="Follow friends to see their study sessions here. Sessions you share with followers show up here too.">
              <Button title="Find friends" icon="search" onPress={() => router.push('/search')} />
              <Button title="Start a session" variant="secondary" icon="study" onPress={() => router.navigate('/study')} />
            </EmptyState>
          }
          ListFooterComponent={
            feed.loadingMore ? (
              <ActivityIndicator style={styles.footer} color={colors.accent} />
            ) : feed.loadMoreError ? (
              <View style={[styles.column, styles.footer]}>
                <Banner tone="danger" message={feed.loadMoreError} actionLabel="Retry" onAction={feed.loadMore} />
              </View>
            ) : feed.items.length > 0 && !feed.hasMore ? (
              <AppText variant="small" color={colors.textMuted} style={styles.end}>
                You’re all caught up ✨
              </AppText>
            ) : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH + Spacing.lg * 2,
    alignSelf: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  unreadDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.like,
    borderWidth: 2,
    borderColor: c.background,
  },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxxl, flexGrow: 1 },
  listHeader: { gap: Spacing.md, marginBottom: Spacing.lg },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  footer: { marginTop: Spacing.lg },
  end: { textAlign: 'center', marginTop: Spacing.xl },
}));
