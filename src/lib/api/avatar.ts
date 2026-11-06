import { updateProfile } from '@/lib/api/profiles';
import { avatarPath, removeObject, uploadImage, type PreparedImage } from '@/lib/api/storage';
import type { Profile } from '@/lib/types';

/**
 * Applies an avatar change: upload new → point profile at it → delete old.
 * The old object is only removed after the profile update succeeded.
 */
export async function applyAvatarChange(profile: Profile, avatar: PreparedImage | null | undefined): Promise<Profile> {
  if (avatar === undefined) return profile;
  const previous = profile.avatar_path;
  let nextPath: string | null = null;
  if (avatar) {
    nextPath = avatarPath(profile.id, avatar);
    await uploadImage('avatars', nextPath, avatar);
  }
  const updated = await updateProfile(profile.id, { avatar_path: nextPath });
  if (previous && previous !== nextPath) {
    await removeObject('avatars', previous).catch(() => undefined);
  }
  return updated;
}
