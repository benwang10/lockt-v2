import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Banner } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { APP_NAME, APP_TAGLINE } from '@/constants/brand';
import { Radius, Spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { validateEmail } from '@/lib/validation';
import { makeStyles, useTheme } from '@/providers/theme';

export default function SignInScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    const emailError = validateEmail(email);
    if (emailError || !password) {
      setError(emailError ?? 'Enter your password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'That email and password don’t match.'
          : authError.message === 'Email not confirmed'
            ? 'Confirm your email first — check your inbox for the link.'
            : friendlyError(authError),
      );
    }
    // On success the root navigator switches to the app automatically.
  };

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <AppText variant="title" color={colors.onAccent}>
            {APP_NAME.slice(0, 1)}
          </AppText>
        </View>
        <AppText variant="display" accessibilityRole="header">
          {APP_NAME}
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          {APP_TAGLINE}. Track study sessions, celebrate what you got done, and cheer on your friends.
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
        placeholder="you@school.edu"
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Sign in" size="lg" onPress={submit} loading={submitting} />
      <View style={styles.links}>
        <Link href="/forgot-password" style={styles.link}>
          <AppText variant="smallStrong" color={colors.accent}>
            Forgot password?
          </AppText>
        </Link>
        <Link href="/sign-up" style={styles.link}>
          <AppText variant="smallStrong" color={colors.accent}>
            New here? Create an account
          </AppText>
        </Link>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  hero: { gap: Spacing.sm, marginTop: Spacing.xxl, marginBottom: Spacing.md },
  logo: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  links: { alignItems: 'center', gap: Spacing.xs },
  link: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm },
}));
