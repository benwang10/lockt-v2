import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { completeAuthFromUrl } from '@/lib/auth-links';

/** Target of the sign-up confirmation email link. */
export default function AuthCallbackScreen() {
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);
  const [confirmedElsewhere, setConfirmedElsewhere] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !url) return;
    handled.current = true;
    completeAuthFromUrl(url).then((result) => {
      if (result.ok) router.replace('/');
      else if (result.verifiedButNotSignedIn) setConfirmedElsewhere(true);
      else setError(result.error);
    });
  }, [url]);

  if (confirmedElsewhere) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          icon="checkCircle"
          title="Email confirmed"
          message="Your email is verified. Sign in with your email and password to continue (the link was opened somewhere other than where you signed up, so we couldn’t sign you in automatically).">
          <Button title="Go to sign in" onPress={() => router.replace('/')} />
        </EmptyState>
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <ErrorState title="Link didn’t work" message={error} />
        <Button title="Go to sign in" variant="secondary" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <LoadingState label="Confirming your email…" />
    </Screen>
  );
}
