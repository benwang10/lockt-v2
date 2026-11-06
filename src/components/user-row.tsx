import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import type { ProfileSummary } from '@/lib/types';
import { makeStyles, useTheme } from '@/providers/theme';

export function UserRow({
  user,
  following,
  onToggleFollow,
  busy,
}: {
  user: ProfileSummary;
  following?: boolean;
  onToggleFollow?: () => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.main}
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })}
        accessibilityRole="link"
        accessibilityLabel={`${user.display_name}, @${user.username}`}>
        <Avatar path={user.avatar_path} name={user.display_name} seed={user.id} size={44} />
        <View style={styles.text}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {user.display_name}
          </AppText>
          <AppText variant="small" color={colors.textSecondary} numberOfLines={1}>
            @{user.username}
          </AppText>
        </View>
      </Pressable>
      {onToggleFollow ? (
        <Button
          title={following ? 'Following' : 'Follow'}
          variant={following ? 'secondary' : 'primary'}
          size="sm"
          loading={busy}
          onPress={onToggleFollow}
          accessibilityHint={following ? `Unfollow ${user.display_name}` : `Follow ${user.display_name}`}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
  text: { flex: 1 },
}));
