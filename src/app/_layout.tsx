import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { APP_NAME } from '@/constants/brand';
import { FONT_ASSETS, SANS, SERIF } from '@/constants/fonts';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ActiveSessionProvider } from '@/providers/active-session';
import { AuthProvider, useAuth } from '@/providers/auth';
import { ToastProvider } from '@/providers/toast';
import { ThemeProvider, useTheme } from '@/providers/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Bundled fonts (native + web). If loading fails we continue with system fonts.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const fontsReady = fontsLoaded || !!fontError;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedChrome>
          <AuthProvider>
            <ActiveSessionProvider>
              <ToastProvider>
                <RootNavigator fontsReady={fontsReady} />
              </ToastProvider>
            </ActiveSessionProvider>
          </AuthProvider>
        </ThemedChrome>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Status bar, root background and navigation colours follow the active theme. */
function ThemedChrome({ children }: { children: ReactNode }) {
  const { colors, scheme } = useTheme();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);
  const navTheme = useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: scheme === 'dark',
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.like,
      },
      // Each weight is its own family; weight stays 'normal' so Android never synthesizes.
      fonts: {
        regular: { fontFamily: SERIF.regular, fontWeight: 'normal' },
        medium: { fontFamily: SANS.semibold, fontWeight: 'normal' },
        bold: { fontFamily: SERIF.semibold, fontWeight: 'normal' },
        heavy: { fontFamily: SERIF.bold, fontWeight: 'normal' },
      },
    };
  }, [scheme, colors]);
  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </NavigationThemeProvider>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { colors, ready: themeReady } = useTheme();
  const { initializing, session, profile, profileStatus, profileError, reloadProfile, signOut, recovering } = useAuth();
  const signedIn = !!session;
  const profileLoading = signedIn && (profileStatus === 'idle' || profileStatus === 'loading') && !profile;
  const ready = !initializing && !profileLoading && fontsReady && themeReady;

  useEffect(() => {
    if (ready || !isSupabaseConfigured) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!isSupabaseConfigured) return <SetupRequired />;
  if (!ready) return null; // splash screen stays visible

  if (signedIn && profileStatus === 'error' && !profile && !recovering) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <ErrorState
          title="Couldn't load your profile"
          message={profileError ?? 'Please check your connection.'}
          onRetry={reloadProfile}
        />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </Screen>
    );
  }

  const hasProfile = !!profile;
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: SERIF.semibold, fontSize: 18 },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      {/* Unguarded anchor: redirects according to auth state. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />

      <Stack.Protected guard={!signedIn && !recovering}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !hasProfile && !recovering}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && hasProfile && !recovering}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: APP_NAME }} />
        <Stack.Screen name="search" options={{ title: 'Find friends' }} />
        <Stack.Screen name="user/[id]/index" options={{ title: 'Profile' }} />
        <Stack.Screen name="user/[id]/connections" options={{ title: 'Connections' }} />
        <Stack.Screen name="session/[id]/index" options={{ title: 'Session' }} />
        <Stack.Screen name="session/[id]/edit" options={{ title: 'Session details', gestureEnabled: false }} />
        <Stack.Screen name="subjects" options={{ title: 'Subjects', presentation: 'modal' }} />
        <Stack.Screen name="goals/new" options={{ title: 'New goal', presentation: 'modal' }} />
        <Stack.Screen name="profile/edit" options={{ title: 'Edit profile', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="status" options={{ title: 'Your note', presentation: 'modal' }} />
      </Stack.Protected>

      {/* Reachable from email links in any auth state. */}
      <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
      <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
    </Stack>
  );
}

function SetupRequired() {
  const { colors } = useTheme();
  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <EmptyState
        icon="settings"
        title={`${APP_NAME} needs a Supabase project`}
        message="Create a .env file from .env.example with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY), apply the migrations in supabase/migrations, then restart Expo.">
        <AppText variant="small" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          See README.md → “Backend setup”. Never use a service-role key in the app.
        </AppText>
      </EmptyState>
    </Screen>
  );
}
