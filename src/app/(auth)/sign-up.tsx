import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { LogoMark } from '@/components/logo';
import { StudyDecals } from '@/components/study-decals';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Banner, EmptyState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { validateEmail, validatePassword } from '@/lib/validation';
import { Spacing } from '@/constants/theme';
import { makeStyles, useTheme } from '@/providers/theme';
import { useSingleSubmit } from '@/hooks/use-single-submit';

export default function SignUpScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const submit = useSingleSubmit(async () => {
    const problem =
      validateEmail(email) ??
      validatePassword(password) ??
      (password !== confirm ? 'Passwords don’t match.' : null);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: Linking.createURL('/auth-callback') },
    });
    setSubmitting(false);
    if (authError) {
      setError(friendlyError(authError));
      return;
    }
    // If email confirmation is enabled there is no session yet.
    if (!data.session) setAwaitingConfirmation(true);
  });

  if (awaitingConfirmation) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <EmptyState
          icon="send"
          title="Check your inbox"
          message={`We sent a confirmation link to ${email.trim()}. Open it on this device, then sign in.`}>
          <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/sign-in')} />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} background={<StudyDecals />}>
      <View style={styles.hero}>
        <LogoMark size={64} />
        <AppText variant="title" accessibilityRole="header" style={styles.center}>
          Create your account
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.center}>
          You’ll pick a username next.
        </AppText>
      </View>
      {error ? <Banner tone="danger" message={error} /> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        hint="At least 8 characters."
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <TextField
        ref={confirmRef}
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Create account" size="lg" onPress={submit} loading={submitting} />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  hero: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  center: { textAlign: 'center' },
}));
