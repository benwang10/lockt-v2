import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Banner, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import { completeAuthFromUrl } from '@/lib/auth-links';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { validatePassword } from '@/lib/validation';
import { useAuth } from '@/providers/auth';
import { useTheme } from '@/providers/theme';
import { useSingleSubmit } from '@/hooks/use-single-submit';

/** Target of the password-reset email link. */
export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const url = Linking.useLinkingURL();
  const { setRecovering } = useAuth();
  const [phase, setPhase] = useState<'verifying' | 'form' | 'invalid' | 'done'>('verifying');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !url) return;
    handled.current = true;
    // Keep the app on this screen while the recovery session is established.
    setRecovering(true);
    completeAuthFromUrl(url).then((result) => {
      if (result.ok) setPhase('form');
      else {
        setRecovering(false);
        setLinkError(
          result.verifiedButNotSignedIn
            ? 'Open the reset link on the same device and browser where you requested it, or request a new link there.'
            : result.error,
        );
        setPhase('invalid');
      }
    });
  }, [url, setRecovering]);

  const save = useSingleSubmit(async () => {
    const problem = validatePassword(password) ?? (password !== confirm ? 'Passwords don’t match.' : null);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) setError(friendlyError(updateError));
    else setPhase('done');
  });

  if (phase === 'verifying') return <LoadingState label="Checking your reset link…" />;
  if (phase === 'invalid') {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <ErrorState title="Reset link didn’t work" message={linkError ?? ''} />
        <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  if (phase === 'done') {
    return (
      <Screen edges={['bottom', 'left', 'right']} contentStyle={{ padding: 24, gap: 16, justifyContent: 'center' }}>
        <AppText variant="title">Password updated</AppText>
        <AppText color={colors.textSecondary}>You’re signed in with your new password.</AppText>
        <Button
          title="Continue"
          size="lg"
          onPress={() => {
            setRecovering(false);
            router.replace('/');
          }}
        />
      </Screen>
    );
  }
  return (
    <Screen scroll edges={['bottom', 'left', 'right']}>
      <AppText variant="title" accessibilityRole="header">
        Choose a new password
      </AppText>
      {error ? <Banner tone="danger" message={error} /> : null}
      <TextField
        label="New password"
        hint="At least 8 characters."
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={save}
      />
      <Button title="Update password" size="lg" onPress={save} loading={saving} />
    </Screen>
  );
}
