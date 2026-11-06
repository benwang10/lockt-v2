import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { SessionPhoto } from '@/components/session-photo';
import { SongCard } from '@/components/song-card';
import { SubjectPill } from '@/components/subject-pill';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { moodInfo } from '@/constants/moods';
import { Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { formatDuration, formatRelativeTime } from '@/lib/time';
import type { SessionCardData } from '@/lib/types';
import { makeStyles, useTheme } from '@/providers/theme';

export function SessionCard({
  session,
  onToggleLike,
  onPress,
  expanded = false,
  showAuthor = true,
}: {
  session: SessionCardData;
  onToggleLike?: (session: SessionCardData) => void;
  onPress?: () => void;
  expanded?: boolean;
  showAuthor?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const mood = moodInfo(session.mood);
  const author = session.author;
  const openProfile = () => router.push({ pathname: '/user/[id]', params: { id: author.id } });
  const openDetail = onPress ?? (() => router.push({ pathname: '/session/[id]', params: { id: session.id } }));

  return (
    <View style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: session.subject_color }]} />
      <View style={styles.inner}>
        {showAuthor ? (
          <Pressable
            onPress={openProfile}
            accessibilityRole="link"
            accessibilityLabel={`${author.display_name}, @${author.username}. View profile`}
            style={styles.authorRow}>
            <Avatar path={author.avatar_path} name={author.display_name} seed={author.id} size={40} />
            <View style={styles.flex}>
              <AppText variant="smallStrong" numberOfLines={1}>
                {author.display_name}
              </AppText>
              <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                @{author.username} · {formatRelativeTime(session.completed_at)}
              </AppText>
            </View>
            {session.visibility === 'private' ? <PrivateBadge /> : null}
          </Pressable>
        ) : (
          <View style={styles.metaRow}>
            <AppText variant="caption" color={colors.textSecondary}>
              {formatRelativeTime(session.completed_at)}
            </AppText>
            {session.visibility === 'private' ? <PrivateBadge /> : null}
          </View>
        )}

        <Pressable
          onPress={expanded ? undefined : openDetail}
          disabled={expanded}
          accessibilityRole={expanded ? undefined : 'button'}
          accessibilityLabel={expanded ? undefined : `Open session: ${session.title ?? session.subject_name}`}
          style={styles.body}>
          <View style={styles.titleRow}>
            <SubjectPill name={session.subject_name} color={session.subject_color} />
            <View style={styles.duration}>
              <Icon name="clock" size={14} color={colors.textSecondary} />
              <AppText variant="smallStrong" color={colors.text}>
                {formatDuration(session.duration_seconds)}
              </AppText>
            </View>
          </View>

          <AppText variant="heading" numberOfLines={expanded ? undefined : 2}>
            {session.title ?? `${session.subject_name} session`}
          </AppText>

          {session.accomplishment ? (
            <View style={styles.accomplishment}>
              <AppText variant="overline" color={colors.accentStrong}>
                ACCOMPLISHED
              </AppText>
              <AppText variant="body" numberOfLines={expanded ? undefined : 4}>
                {session.accomplishment}
              </AppText>
            </View>
          ) : null}

          {expanded && session.intention ? (
            <AppText variant="small" color={colors.textSecondary}>
              Intention: {session.intention}
            </AppText>
          ) : null}

          {mood ? (
            <AppText variant="small" color={colors.textSecondary}>
              Feeling {mood.emoji} {mood.label.toLowerCase()}
            </AppText>
          ) : null}
        </Pressable>

        {session.buddies.length > 0 ? <BuddiesRow buddies={session.buddies} /> : null}

        {session.photo_path ? (
          <SessionPhoto path={session.photo_path} alt={`Photo from ${author.display_name}'s study session`} />
        ) : null}

        {session.song_title ? (
          <SongCard title={session.song_title} artist={session.song_artist} url={session.song_url} />
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={() => onToggleLike?.(session)}
            disabled={!onToggleLike}
            accessibilityRole="button"
            accessibilityLabel={session.liked_by_me ? 'Unlike' : 'Like'}
            accessibilityState={{ selected: session.liked_by_me }}
            accessibilityHint={`${session.like_count} ${session.like_count === 1 ? 'like' : 'likes'}`}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
            <Icon
              name={session.liked_by_me ? 'heartFill' : 'heart'}
              size={22}
              color={session.liked_by_me ? colors.like : colors.textSecondary}
            />
            <AppText variant="smallStrong" color={colors.textSecondary}>
              {session.like_count}
            </AppText>
          </Pressable>
          <Pressable
            onPress={expanded ? undefined : openDetail}
            disabled={expanded}
            accessibilityRole="button"
            accessibilityLabel={`${session.comment_count} comments. Open comments`}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
            <Icon name="comment" size={21} color={colors.textSecondary} />
            <AppText variant="smallStrong" color={colors.textSecondary}>
              {session.comment_count}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Accepted study buddies, each a link to their profile. */
function BuddiesRow({ buddies }: { buddies: SessionCardData['buddies'] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.buddies} accessibilityRole="none">
      <Icon name="people" size={16} color={colors.textSecondary} />
      <AppText variant="small" color={colors.textSecondary}>
        with
      </AppText>
      {buddies.map(({ inviteId, profile }, i) => (
        <Pressable
          key={inviteId}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: profile.id } })}
          accessibilityRole="link"
          accessibilityLabel={`Study buddy ${profile.display_name}, @${profile.username}. View profile`}
          hitSlop={6}
          style={({ pressed }) => [styles.buddy, pressed && { opacity: 0.6 }]}>
          <Avatar path={profile.avatar_path} name={profile.display_name} seed={profile.id} size={22} />
          <AppText variant="smallStrong" color={colors.text}>
            {profile.display_name}
            {i < buddies.length - 1 ? ',' : ''}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

function PrivateBadge() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.privateBadge} accessibilityLabel="Only visible to you">
      <Icon name="lock" size={12} color={colors.textSecondary} />
      <AppText variant="caption" color={colors.textSecondary}>
        Only me
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((c, { shadow }) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    ...shadow,
  },
  stripe: { width: 5 },
  inner: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  flex: { flex: 1 },
  buddies: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.xs + 2, rowGap: Spacing.xs },
  buddy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: 28 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TOUCH_TARGET },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { gap: Spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  accomplishment: {
    backgroundColor: c.accentSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 2,
  },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginLeft: -Spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  actionPressed: { backgroundColor: c.surfaceMuted },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: c.surfaceMuted,
  },
}));
