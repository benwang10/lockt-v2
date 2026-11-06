import { ProfileForm } from '@/components/profile-form';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { APP_NAME } from '@/constants/brand';

import { applyAvatarChange } from '@/lib/api/avatar';
import { createProfile } from '@/lib/api/profiles';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/providers/auth';
import { useToast } from '@/providers/toast';
import { useTheme } from '@/providers/theme';

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { userId, session, setProfile, signOut } = useAuth();
  const toast = useToast();
  if (!userId) return null;
  const emailName = session?.user.email?.split('@')[0] ?? '';

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <AppText variant="title" accessibilityRole="header">
        Welcome to {APP_NAME} 👋
      </AppText>
      <AppText variant="body" color={colors.textSecondary}>
        Set up your profile so friends can find you. Your basic profile is visible to other signed-in users; your
        sessions stay private until you choose to share them.
      </AppText>
      <ProfileForm
        userId={userId}
        initial={{ username: emailName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20), displayName: '', bio: '' }}
        submitLabel="Start studying"
        onSubmit={async (values) => {
          let profile = await createProfile({
            id: userId,
            username: values.username,
            display_name: values.displayName,
            bio: values.bio || null,
          });
          if (values.avatar) {
            try {
              profile = await applyAvatarChange(profile, values.avatar);
            } catch (e) {
              toast(`Profile created, but the photo didn’t upload (${friendlyError(e)}). Add it later from Edit profile.`, 'error');
            }
          }
          setProfile(profile);
        }}
      />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
