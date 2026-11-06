import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileHeader } from '@/components/profile-header';
import { SessionCard } from '@/components/session-card';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Banner, EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { MAX_CONTENT_WIDTH, Spacing } from '@/constants/theme';
import { useLikeToggle } from '@/hooks/use-like-toggle';
import { usePagedSessions } from '@/hooks/use-paged-sessions';
import { useQuery } from '@/hooks/use-query';
import { fetchFollowCounts, fetchHighlight, fetchProfile, followUser, isFollowing, unfollowUser } from '@/lib/api/profiles';
import { fetchStatus } from '@/lib/api/statuses';
import { localWeekRange } from '@/lib/week';
import { fetchUserSessionsPage } from '@/lib/api/sessions';
import { confirmAction } from '@/lib/confirm';
import { friendlyError } from '@/lib/errors';
import { goBackOr } from '@/lib/navigation';
import { invalidate } from '@/lib/events';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';
import { makeStyles, useTheme } from '@/providers/theme';

export default function UserProfileScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useMe();
  const toast = useToast();
  const isMe = id === userId;
  const info = useQuery(
    async () => {
      const [profile, counts, following, status, highlight] = await Promise.all([
        fetchProfile(id),
        fetchFollowCounts(id),
        isMe ? Promise.resolve(false) : isFollowing(userId, id),
        // Both are followers-only on the server; non-followers simply get null.
        fetchStatus(id).catch(() => null),
        fetchHighlight(id, localWeekRange(new Date())).catch(() => null),
      ]);
      return { profile, counts, following, status, highlight };
    },
    [id, userId],
    { topics: ['social', 'profile', 'sessions', 'status'] },
  );
  const sessions = usePagedSessions((cursor) => fetchUserSessionsPage(userId, id, cursor), [id, userId]);
  const toggleLike = useLikeToggle(sessions.updateItem);
  const [followBusy, setFollowBusy] = useState(false);

  if (info.loading) return <LoadingState />;
  if (info.error && !info.data) return <ErrorState message={info.error} onRetry={info.reload} />;
  const profile = info.data?.profile;
  if (!profile) {
    return (
      <EmptyState icon="profile" title="Profile not found" message="This account may have been deleted.">
        <Button title="Go back" variant="secondary" onPress={() => goBackOr('/feed')} />
      </EmptyState>
    );
  }
  const following = !!info.data?.following;

  const toggleFollow = async () => {
    if (followBusy) return;
    if (following) {
      const ok = await confirmAction({
        title: `Unfollow @${profile.username}?`,
        message: 'You’ll stop seeing their shared sessions.',
        confirmLabel: 'Unfollow',
        destructive: true,
      });
      if (!ok) return;
    }
    setFollowBusy(true);
    const next = !following;
    // Optimistic follow state + count, rolled back on failure.
    const apply = (value: boolean) =>
      info.setData((prev) =>
        prev
          ? {
              ...prev,
              following: value,
              counts: { ...prev.counts, followers: Math.max(0, prev.counts.followers + (value ? 1 : -1)) },
            }
          : prev,
      );
    apply(next);
    try {
      if (next) await followUser(userId, id);
      else await unfollowUser(userId, id);
      invalidate('social');
      sessions.refresh();
      info.refresh();
    } catch (e) {
      apply(!next);
      toast(friendlyError(e), 'error');
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={isMe || following ? sessions.items : []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={info.refreshing || sessions.refreshing}
            onRefresh={() => {
              info.refresh();
              sessions.refresh();
            }}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={[styles.column, styles.header]}>
            <ProfileHeader
              profile={profile}
              counts={info.data?.counts}
              status={info.data?.status}
              highlight={info.data?.highlight}
              isMe={isMe}
              actions={
                isMe ? (
                  <Button title="Edit profile" variant="secondary" size="sm" onPress={() => router.push('/profile/edit')} />
                ) : (
                  <Button
                    title={following ? 'Following' : 'Follow'}
                    icon={following ? 'check' : 'followAdd'}
                    variant={following ? 'secondary' : 'primary'}
                    onPress={toggleFollow}
                    loading={followBusy}
                    style={styles.followButton}
                  />
                )
              }
            />
            <SectionHeader title="Shared sessions" />
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
          !isMe && !following ? (
            <View style={styles.column}>
              <Card>
                <View style={styles.lockRow}>
                  <Icon name="lock" size={18} color={colors.textSecondary} />
                  <AppText variant="body" color={colors.textSecondary} style={styles.flex}>
                    Follow @{profile.username} to see the sessions they share with followers.
                  </AppText>
                </View>
              </Card>
            </View>
          ) : sessions.loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : sessions.error ? (
            <View style={styles.column}>
              <Banner tone="danger" message={sessions.error} actionLabel="Retry" onAction={sessions.retry} />
            </View>
          ) : (
            <View style={styles.column}>
              <Card>
                <AppText variant="body" color={colors.textSecondary}>
                  No shared sessions yet.
                </AppText>
              </Card>
            </View>
          )
        }
        ListFooterComponent={sessions.loadingMore ? <ActivityIndicator style={{ marginTop: Spacing.lg }} color={colors.accent} /> : undefined}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  list: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { gap: Spacing.lg, marginBottom: Spacing.md },
  followButton: { flex: 1 },
  lockRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  flex: { flex: 1 },
}));
