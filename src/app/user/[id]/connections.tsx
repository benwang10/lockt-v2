import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UserRow } from '@/components/user-row';
import { Segmented } from '@/components/ui/chip';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { MAX_CONTENT_WIDTH, Spacing } from '@/constants/theme';
import { useFollowToggle } from '@/hooks/use-follow-toggle';
import { useQuery } from '@/hooks/use-query';
import { fetchConnections, fetchFollowingIds } from '@/lib/api/profiles';
import { useMe } from '@/providers/auth';
import { makeStyles } from '@/providers/theme';

export default function ConnectionsScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ id: string; tab?: 'followers' | 'following' }>();
  const { userId } = useMe();
  const [tab, setTab] = useState<'followers' | 'following'>(params.tab === 'following' ? 'following' : 'followers');
  const list = useQuery(() => fetchConnections(params.id, tab), [params.id, tab], { topics: ['social'] });
  const mine = useQuery(() => fetchFollowingIds(userId), [userId], { topics: ['social'] });
  const follow = useFollowToggle(mine.data, (next) => mine.setData(() => next));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: tab === 'followers' ? 'Followers' : 'Following' }} />
      <View style={[styles.column, styles.tabs]}>
        <Segmented
          options={[
            { value: 'followers', label: 'Followers' },
            { value: 'following', label: 'Following' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {list.loading ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.column}>
              <UserRow
                user={item}
                following={mine.data?.has(item.id)}
                busy={follow.busy.has(item.id)}
                onToggleFollow={item.id === userId || !mine.data ? undefined : () => follow.toggle(item)}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState icon="people" title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  tabs: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  list: { padding: Spacing.lg, flexGrow: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
}));
