import { router } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveSessionBanner } from '@/components/active-session-banner';
import { ProfileHeader } from '@/components/profile-header';
import { SessionCard } from '@/components/session-card';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Banner } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { MAX_CONTENT_WIDTH, Spacing } from '@/constants/theme';
import { useLikeToggle } from '@/hooks/use-like-toggle';
import { usePagedSessions } from '@/hooks/use-paged-sessions';
import { useQuery } from '@/hooks/use-query';
import { fetchFollowCounts, fetchHighlight } from '@/lib/api/profiles';
import { fetchStatus } from '@/lib/api/statuses';
import { localWeekRange } from '@/lib/week';
import { fetchUserSessionsPage } from '@/lib/api/sessions';
import { confirmAction } from '@/lib/confirm';
import { useAuth, useMe } from '@/providers/auth';
import { useActiveSession } from '@/providers/active-session';
import { makeStyles, useTheme } from '@/providers/theme';

export default function MyProfileScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userId, profile } = useMe();
  const { signOut } = useAuth();
  const active = useActiveSession();
  const counts = useQuery(() => fetchFollowCounts(userId), [userId], { topics: ['social'] });
  // Status + highlight are secondary: failures just hide them.
  const extras = useQuery(
    async () => {
      const [status, highlight] = await Promise.all([
        fetchStatus(userId).catch(() => null),
        fetchHighlight(userId, localWeekRange(new Date())).catch(() => null),
      ]);
      return { status, highlight };
    },
    [userId, profile.highlight_stat],
    { topics: ['sessions', 'goals', 'profile', 'status'] },
  );
  const sessions = usePagedSessions((cursor) => fetchUserSessionsPage(userId, userId, cursor), [userId]);
  const toggleLike = useLikeToggle(sessions.updateItem);

  const doSignOut = async () => {
    const ok = await confirmAction({
      title: 'Sign out?',
      message: active.session ? 'Your running session stays saved on the server and will be here when you sign back in.' : undefined,
      confirmLabel: 'Sign out',
    });
    if (ok) await signOut();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={sessions.items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={sessions.refreshing || counts.refreshing}
            onRefresh={() => {
              sessions.refresh();
              counts.refresh();
              extras.refresh();
            }}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={[styles.column, styles.header]}>
            <ActiveSessionBanner />
            <ProfileHeader
              profile={profile}
              counts={counts.data}
              status={extras.data?.status}
              highlight={extras.data?.highlight}
              isMe
              headerAction={<IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />}
              actions={
                <>
                  <Button
                    title="Edit profile"
                    variant="secondary"
                    size="sm"
                    icon="edit"
                    onPress={() => router.push('/profile/edit')}
                    style={styles.action}
                  />
                  <Button
                    title="Subjects"
                    variant="secondary"
                    size="sm"
                    icon="book"
                    onPress={() => router.push('/subjects')}
                    style={styles.action}
                  />
                </>
              }
            />
            {counts.error ? <Banner tone="danger" message={counts.error} actionLabel="Retry" onAction={counts.reload} /> : null}
            <SectionHeader title="Shared sessions" />
            <AppText variant="caption" color={colors.textSecondary}>
              This is what your followers see. Private sessions live in Progress → History.
            </AppText>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.lg }} />}
        renderItem={({ item }) => (
          <View style={styles.column}>
            <SessionCard session={item} showAuthor={false} onToggleLike={toggleLike} />
          </View>
        )}
        onEndReached={sessions.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          sessions.loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : sessions.error ? (
            <View style={styles.column}>
              <Banner tone="danger" message={sessions.error} actionLabel="Retry" onAction={sessions.retry} />
            </View>
          ) : (
            <View style={styles.column}>
              <Card>
                <AppText variant="body" color={colors.textSecondary}>
                  You haven’t shared a session yet. After your next session, choose “Followers” to share it.
                </AppText>
              </Card>
            </View>
          )
        }
        ListFooterComponent={
          <View style={[styles.column, styles.footer]}>
            {sessions.loadingMore ? <ActivityIndicator color={colors.accent} /> : null}
            {sessions.loadMoreError ? (
              <Banner tone="danger" message={sessions.loadMoreError} actionLabel="Retry" onAction={sessions.loadMore} />
            ) : null}
            <Button title="Sign out" variant="ghost" icon="logout" onPress={doSignOut} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  list: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { gap: Spacing.lg, marginBottom: Spacing.md },
  footer: { marginTop: Spacing.xl, gap: Spacing.md },
  // Equal share of the row; wraps to full width rows only if a label can't fit.
  action: { flexGrow: 1, flexBasis: 140, minHeight: 44 },
}));
