import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UserRow } from '@/components/user-row';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { MAX_CONTENT_WIDTH, Spacing } from '@/constants/theme';
import { useFollowToggle } from '@/hooks/use-follow-toggle';
import { useQuery } from '@/hooks/use-query';
import { fetchFollowingIds, searchProfiles } from '@/lib/api/profiles';
import { friendlyError } from '@/lib/errors';
import type { Profile } from '@/lib/types';
import { useMe } from '@/providers/auth';
import { makeStyles } from '@/providers/theme';

export default function SearchScreen() {
  const styles = useStyles();
  const { userId } = useMe();
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ q: string; results: Profile[] | null; error: string | null } | null>(null);
  const mine = useQuery(() => fetchFollowingIds(userId), [userId], { topics: ['social'] });
  const follow = useFollowToggle(mine.data, (next) => mine.setData(() => next));
  const q = query.trim();
  const enabled = q.length >= 2;

  // Debounced search; responses for an outdated query are ignored.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchProfiles(q)
        .then((r) => !cancelled && setResult({ q, results: r, error: null }))
        .catch((e) => !cancelled && setResult({ q, results: null, error: friendlyError(e) }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, enabled, attempt]);

  const current = enabled && result?.q === q ? result : null;
  const results = current?.results ?? null;
  const error = current?.error ?? null;
  const searching = enabled && !current;
  const retry = () => {
    setResult(null);
    setAttempt((n) => n + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <View style={[styles.column, styles.searchBox]}>
        <TextField
          label="Search people"
          hideLabel
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username or name"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : searching ? (
        <LoadingState label="Searching…" />
      ) : (
        <FlatList
          data={results ?? []}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.column}>
              <UserRow
                user={item}
                following={mine.data?.has(item.id)}
                busy={follow.busy.has(item.id)}
                onToggleFollow={mine.data ? () => follow.toggle(item) : undefined}
              />
            </View>
          )}
          ListEmptyComponent={
            !enabled ? (
              <EmptyState
                icon="search"
                title="Find your study friends"
                message="Search by username or display name, then follow them to see their shared sessions."
              />
            ) : (
              <EmptyState icon="search" title="No matches" message={`Nobody matches “${query.trim()}”. Check the spelling or try their username.`} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  searchBox: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  list: { padding: Spacing.lg, flexGrow: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
}));
