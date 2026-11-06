import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/auth';

/** Unguarded entry route: sends people to the right place for their auth state. */
export default function Index() {
  const { session, profile } = useAuth();
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) return <Redirect href="/onboarding" />;
  return <Redirect href="/feed" />;
}
