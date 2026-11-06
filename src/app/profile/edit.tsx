
import { ProfileForm } from '@/components/profile-form';
import { Screen } from '@/components/ui/screen';
import { applyAvatarChange } from '@/lib/api/avatar';
import { updateProfile } from '@/lib/api/profiles';
import { invalidate } from '@/lib/events';
import { goBackOr } from '@/lib/navigation';
import { useAuth, useMe } from '@/providers/auth';

export default function EditProfileScreen() {
  const { userId, profile } = useMe();
  const { setProfile } = useAuth();
  return (
    <Screen scroll edges={['bottom', 'left', 'right']}>
      <ProfileForm
        userId={userId}
        initial={{ username: profile.username, displayName: profile.display_name, bio: profile.bio ?? '' }}
        currentAvatarPath={profile.avatar_path}
        submitLabel="Save profile"
        onSubmit={async (values) => {
          let updated = await updateProfile(userId, {
            username: values.username,
            display_name: values.displayName,
            bio: values.bio || null,
          });
          updated = await applyAvatarChange(updated, values.avatar);
          setProfile(updated);
          invalidate('profile', 'sessions');
          goBackOr('/profile');
        }}
      />
    </Screen>
  );
}
