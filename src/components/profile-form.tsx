import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { isUsernameAvailable } from '@/lib/api/profiles';
import { pickAvatar, type PreparedImage } from '@/lib/api/storage';
import { friendlyError } from '@/lib/errors';
import { LIMITS, normalizeUsername, validateDisplayName, validateUsername } from '@/lib/validation';
import { makeStyles, useTheme } from '@/providers/theme';
import { useSingleSubmit } from '@/hooks/use-single-submit';

export type ProfileFormValues = {
  username: string;
  displayName: string;
  bio: string;
  /** New avatar to upload, `null` to remove the current one, undefined to keep. */
  avatar: PreparedImage | null | undefined;
};

export function ProfileForm({
  userId,
  initial,
  currentAvatarPath,
  submitLabel,
  onSubmit,
}: {
  userId: string;
  initial: { username: string; displayName: string; bio: string };
  currentAvatarPath?: string | null;
  submitLabel: string;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [username, setUsername] = useState(initial.username);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [avatar, setAvatar] = useState<PreparedImage | null | undefined>(undefined);
  const [checked, setChecked] = useState<{ username: string; available: boolean | null } | null>(null);
  const [errors, setErrors] = useState<{ username?: string | null; displayName?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Debounced username availability check (the unique index is the real guard).
  const normalized = normalizeUsername(username);
  const shouldCheck = !validateUsername(normalized) && normalized !== initial.username;
  useEffect(() => {
    if (!shouldCheck) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      isUsernameAvailable(normalized, userId)
        .then((ok) => !cancelled && setChecked({ username: normalized, available: ok }))
        .catch(() => !cancelled && setChecked({ username: normalized, available: null }));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, shouldCheck, userId]);
  const availability: 'unknown' | 'checking' | 'available' | 'taken' = !shouldCheck
    ? 'unknown'
    : checked?.username !== normalized
      ? 'checking'
      : checked.available === null
        ? 'unknown'
        : checked.available
          ? 'available'
          : 'taken';

  const choosePhoto = async () => {
    setFormError(null);
    try {
      const picked = await pickAvatar();
      if (picked) setAvatar(picked);
    } catch (e) {
      setFormError(friendlyError(e));
    }
  };

  const submit = useSingleSubmit(async () => {
    const next = { username: validateUsername(username), displayName: validateDisplayName(displayName) };
    if (!next.username && availability === 'taken') next.username = 'That username is taken.';
    setErrors(next);
    if (next.username || next.displayName) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit({ username: normalizeUsername(username), displayName: displayName.trim(), bio: bio.trim(), avatar });
    } catch (e: any) {
      if (e?.code === '23505') setErrors({ username: 'That username is taken.' });
      else setFormError(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  });

  const usernameHint =
    availability === 'checking'
      ? 'Checking…'
      : availability === 'available'
        ? '✓ Available'
        : availability === 'taken'
          ? undefined
          : 'Lowercase letters, numbers and underscores.';

  return (
    <View style={styles.form}>
      {formError ? <Banner tone="danger" message={formError} /> : null}
      <View style={styles.avatarRow}>
        <Avatar
          path={avatar === null ? null : currentAvatarPath}
          localUri={avatar?.previewUri}
          name={displayName || username || '?'}
          seed={userId}
          size={80}
        />
        <View style={styles.avatarActions}>
          <Button title={avatar || currentAvatarPath ? 'Change photo' : 'Add photo (optional)'} variant="secondary" size="sm" icon="photo" onPress={choosePhoto} />
          {avatar || (currentAvatarPath && avatar !== null) ? (
            <Pressable onPress={() => setAvatar(null)} accessibilityRole="button" style={styles.remove}>
              <AppText variant="smallStrong" color={colors.danger}>
                Remove photo
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
      <TextField
        label="Username"
        value={username}
        onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={LIMITS.usernameMax}
        error={errors.username ?? (availability === 'taken' ? 'That username is taken.' : null)}
        hint={usernameHint}
      />
      <TextField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        autoComplete="name"
        maxLength={LIMITS.displayName}
        error={errors.displayName}
      />
      <TextField
        label="Bio (optional)"
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={LIMITS.bio}
        showCount
        placeholder="CS @ UCLA · learning one problem set at a time"
      />
      <Button title={submitLabel} size="lg" onPress={submit} loading={submitting} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  form: { gap: Spacing.lg },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  avatarActions: { gap: Spacing.xs, alignItems: 'flex-start' },
  remove: { paddingVertical: Spacing.sm },
}));
