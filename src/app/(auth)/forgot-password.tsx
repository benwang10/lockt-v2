import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Banner, EmptyState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { validateEmail } from '@/lib/validation';
import { useTheme } from '@/providers/theme';
import { useSingleSubmit } from '@/hooks/use-single-submit';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = useSingleSubmit(async () => {
    const problem = validateEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL('/reset-password'),
    });
    setSubmitting(false);
    if (authError) setError(friendlyError(authError));
    else setSent(true);
  });

  if (sent) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <EmptyState
          icon="send"
          title="Check your email"
          message="If an account exists for that address, we sent a link to reset your password. Open it on this device.">
          <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/sign-in')} />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']}>
      <AppText variant="title" accessibilityRole="header">
        Reset your password
      </AppText>
      <AppText variant="body" color={colors.textSecondary}>
        Enter the email you signed up with and we’ll send you a reset link.
      </AppText>
      {error ? <Banner tone="danger" message={error} /> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <Button title="Send reset link" size="lg" onPress={submit} loading={submitting} />
    </Screen>
  );
}
