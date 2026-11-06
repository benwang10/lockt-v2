import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchUnreadCount } from '@/lib/api/notifications';
import { useTopicVersion } from '@/lib/events';

/**
 * Unread notification count for the Feed bell. Re-checked whenever the screen
 * gains focus, the app returns to the foreground, or notifications change.
 * A failed check keeps the last known value (the bell never errors).
 */
export function useUnreadNotifications(): number {
  const [count, setCount] = useState(0);
  const version = useTopicVersion('notifications');

  const check = useCallback(() => {
    fetchUnreadCount()
      .then(setCount)
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      check();
    }, [check]),
  );

  // Re-check after reading / marking notifications elsewhere.
  useEffect(() => {
    if (version !== '0') check();
  }, [check, version]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return count;
}
