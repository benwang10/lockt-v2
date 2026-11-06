import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { fetchProfile } from '@/lib/api/profiles';
import { clearSignedUrlCache } from '@/lib/api/storage';
import { friendlyError } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

type AuthContextValue = {
  /** True until the persisted session has been read from storage. */
  initializing: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  profileStatus: ProfileStatus;
  profileError: string | null;
  /** True while the user is completing a password reset from an email link. */
  recovering: boolean;
  setRecovering: (value: boolean) => void;
  reloadProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Convenience for screens that only render when signed in with a profile. */
export function useMe(): { userId: string; profile: Profile } {
  const { userId, profile } = useAuth();
  if (!userId || !profile) throw new Error('useMe used outside the signed-in app');
  return { userId, profile };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const userId = session?.user.id ?? null;
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .finally(() => mounted && setInitializing(false));

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        setProfileState(null);
        setProfileStatus('idle');
        loadedFor.current = null;
        clearSignedUrlCache();
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    setProfileStatus('loading');
    setProfileError(null);
    try {
      const p = await fetchProfile(uid);
      setProfileState(p);
      setProfileStatus('ready');
      loadedFor.current = uid;
    } catch (e) {
      // Never treat a failed request as "no profile" — that would send an
      // existing user to onboarding. Show a retryable error instead.
      setProfileError(friendlyError(e));
      setProfileStatus('error');
    }
  }, []);

  useEffect(() => {
    if (userId && loadedFor.current !== userId) {
      loadProfile(userId);
    }
  }, [userId, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      session,
      userId,
      profile,
      profileStatus,
      profileError,
      recovering,
      setRecovering,
      reloadProfile: async () => {
        if (userId) await loadProfile(userId);
      },
      setProfile: (p) => {
        setProfileState(p);
        setProfileStatus('ready');
        loadedFor.current = p.id;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
          // Clear the local session even if the server could not be reached.
          await supabase.auth.signOut({ scope: 'local' });
        }
      },
    }),
    [initializing, session, userId, profile, profileStatus, profileError, recovering, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
