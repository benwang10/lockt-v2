import './polyfills';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * Only the project URL and the public (anon / publishable) key belong in the
 * client. Never put a service-role or secret key in EXPO_PUBLIC_* variables:
 * they are bundled into the app. All access control is enforced by RLS.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const publicKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = /^https?:\/\//.test(url) && publicKey.length > 20;

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url : 'http://localhost:54321',
  isSupabaseConfigured ? publicKey : 'not-configured-public-key-placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      ...(Platform.OS !== 'web' ? { lock: processLock } : {}),
    },
  },
);

// Refresh tokens only while the app is in the foreground (native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
