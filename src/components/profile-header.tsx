import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { formatHighlight } from '@/lib/highlight';
import { formatRelativeTime } from '@/lib/time';
import type { HighlightValue, Profile, ProfileStatus } from '@/lib/types';
import { makeStyles, useTheme } from '@/providers/theme';

export function ProfileHeader({
  profile,
  counts,
  actions,
  status,
  highlight,
  isMe = false,
  headerAction,
}: {
  profile: Profile;
  counts?: { followers: number; following: number };
  actions?: ReactNode;
  /** Compact control beside the name (e.g. the Settings icon on your own profile). */
  headerAction?: ReactNode;
  /** Active status (already filtered by followers-only RLS and expiry). */
  status?: ProfileStatus | null;
  /** Featured statistic; null when hidden or not visible to this viewer. */
  highlight?: HighlightValue | null;
  isMe?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const open = (tab: 'followers' | 'following') =>
    router.push({ pathname: '/user/[id]/connections', params: { id: profile.id, tab } });
  const stat = highlight ? formatHighlight(highlight) : null;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Avatar path={profile.avatar_path} name={profile.display_name} seed={profile.id} size={76} />
        <View style={styles.counts}>
          <Count label="Followers" value={counts?.followers} onPress={() => open('followers')} />
          <Count label="Following" value={counts?.following} onPress={() => open('following')} />
        </View>
      </View>
      <View style={styles.nameRow}>
        {/* minWidth 0 lets long names wrap instead of pushing the action off screen. */}
        <View style={styles.names}>
          <AppText variant="title" accessibilityRole="header" numberOfLines={3}>
            {profile.display_name}
          </AppText>
          <AppText variant="body" color={colors.textSecondary} numberOfLines={1} ellipsizeMode="middle">
            @{profile.username}
          </AppText>
        </View>
        {headerAction ? <View style={styles.headerAction}>{headerAction}</View> : null}
      </View>

      {status ? (
        <Pressable
          onPress={isMe ? () => router.push('/note') : undefined}
          disabled={!isMe}
          accessibilityRole={isMe ? 'button' : 'text'}
          accessibilityLabel={`Note: ${status.emoji ?? ''} ${status.body ?? ''}. ${isMe ? 'Edit note' : ''}`}
          style={({ pressed }) => [styles.note, pressed && { opacity: 0.8 }]}>
          {status.emoji ? <AppText style={styles.noteEmoji}>{status.emoji}</AppText> : null}
          <View style={styles.flex}>
            {status.body ? <AppText variant="body">{status.body}</AppText> : null}
            <AppText variant="caption" color={colors.textSecondary}>
              {formatRelativeTime(status.updated_at)}
            </AppText>
          </View>
          {isMe ? <Icon name="edit" size={16} color={colors.textSecondary} /> : null}
        </Pressable>
      ) : null}

      {profile.bio ? <AppText variant="body">{profile.bio}</AppText> : null}

      {stat ? (
        <View style={styles.highlight} accessible accessibilityLabel={`${stat.value} ${stat.label}`}>
          <AppText variant="display" color={colors.accentStrong} style={styles.highlightValue}>
            {stat.value}
          </AppText>
          <View style={styles.flex}>
            <AppText variant="smallStrong" color={colors.accentStrong}>
              {stat.label}
            </AppText>
            {isMe ? (
              <AppText variant="caption" color={colors.textSecondary}>
                {highlight?.kind === 'wins_week' ? 'Only you see this' : 'Followers see shared sessions only'}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

function Count({ label, value, onPress }: { label: string; value?: number; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value ?? 0} ${label}. View list`}
      style={({ pressed }) => [styles.count, pressed && { opacity: 0.6 }]}>
      <AppText variant="heading">{value ?? '–'}</AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: Spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl },
  counts: { flexDirection: 'row', gap: Spacing.lg, flex: 1, justifyContent: 'space-around' },
  count: { alignItems: 'center', minHeight: TOUCH_TARGET, minWidth: 72, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  names: { flex: 1, minWidth: 0, gap: 0 },
  headerAction: { marginTop: -2, marginRight: -Spacing.sm },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: c.surfaceMuted,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  noteEmoji: { fontSize: 24, lineHeight: 32 },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: c.accentSoft,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  highlightValue: { fontVariant: ['tabular-nums'] },
  // Equal-width actions; they stack (still full width) when text is very large.
  actions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  flex: { flex: 1 },
}));
