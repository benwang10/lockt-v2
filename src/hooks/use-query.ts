import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { friendlyError } from '@/lib/errors';
import { useTopicVersion, type Topic } from '@/lib/events';

export type QueryState<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setData: (updater: (prev: T | undefined) => T | undefined) => void;
};

/**
 * Minimal data hook: loads on mount, refetches when dependent topics are
 * invalidated and the screen is focused, exposes pull-to-refresh and retry.
 * Stale responses from earlier requests are ignored.
 */
export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  opts: { topics?: Topic[]; enabled?: boolean } = {},
): QueryState<T> {
  const { topics = [], enabled = true } = opts;
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(async (mode: 'initial' | 'load' | 'refresh' | 'silent') => {
    const id = ++requestId.current;
    if (mode === 'load') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const result = await fetcherRef.current();
      if (id !== requestId.current) return;
      setDataState(result);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(friendlyError(e));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // 'initial' doesn't touch state synchronously (loading starts as true).
    run('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  // Refetch on focus when relevant data changed elsewhere.
  const version = useTopicVersion(...topics);
  const loadedVersion = useRef(version);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      if (loadedVersion.current !== version) {
        loadedVersion.current = version;
        run('silent');
      }
    }, [enabled, version, run]),
  );

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => run('load'),
    refresh: () => run('refresh'),
    setData: (updater) => setDataState((prev) => updater(prev)),
  };
}
