import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Cursor, Page } from '@/lib/api/sessions';
import { friendlyError } from '@/lib/errors';
import { onSessionUnavailable, useTopicVersion } from '@/lib/events';
import type { SessionCardData } from '@/lib/types';

/**
 * Keyset-paginated session list with pull-to-refresh, load-more, retry and
 * de-duplication by id (a session can never appear twice).
 */
export function usePagedSessions(fetchPage: (cursor: Cursor) => Promise<Page<SessionCardData>>, deps: unknown[]) {
  const [items, setItems] = useState<SessionCardData[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const generation = useRef(0);
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  /** Fetches the first page. Only sets state after the request resolves. */
  const fetchFirst = useCallback(async () => {
    const gen = ++generation.current;
    try {
      const page = await fetchRef.current(null);
      if (gen !== generation.current) return;
      setItems(dedupe(page.items));
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
      setError(null);
      setLoadMoreError(null);
    } catch (e) {
      if (gen !== generation.current) return;
      setError(friendlyError(e));
    } finally {
      if (gen === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore || loading || refreshing) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const page = await fetchRef.current(cursor);
      if (gen !== generation.current) return;
      setItems((prev) => dedupe([...prev, ...page.items]));
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
      setLoadMoreError(null);
    } catch (e) {
      if (gen === generation.current) setLoadMoreError(friendlyError(e));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, cursor, loadingMore, loading, refreshing]);

  useEffect(() => {
    fetchFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFirst, ...deps]);

  // Refetch on focus after sessions / follows changed elsewhere.
  const version = useTopicVersion('sessions', 'social');
  const loadedVersion = useRef(version);
  useFocusEffect(
    useCallback(() => {
      if (loadedVersion.current !== version) {
        loadedVersion.current = version;
        fetchFirst();
      }
    }, [version, fetchFirst]),
  );

  // A session that became unavailable elsewhere disappears from this list now.
  useEffect(() => onSessionUnavailable((id) => setItems((prev) => prev.filter((s) => s.id !== id))), []);

  const updateItem = useCallback((id: string, patch: (s: SessionCardData) => SessionCardData) => {
    setItems((prev) => prev.map((s) => (s.id === id ? patch(s) : s)));
  }, []);

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    loadMoreError,
    refresh: () => {
      setRefreshing(true);
      return fetchFirst();
    },
    retry: () => {
      setLoading(true);
      return fetchFirst();
    },
    loadMore,
    updateItem,
    removeItem: (id: string) => setItems((prev) => prev.filter((s) => s.id !== id)),
  };
}

function dedupe(list: SessionCardData[]): SessionCardData[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}
