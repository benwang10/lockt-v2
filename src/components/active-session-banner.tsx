import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { SubjectDot } from '@/components/subject-pill';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { SANS } from '@/constants/fonts';
import { Radius, Spacing } from '@/constants/theme';
import { formatClock } from '@/lib/time';
import { useActiveSession, useNow } from '@/providers/active-session';
import { makeStyles, useTheme } from '@/providers/theme';

/** Shown on other tabs so a running session is never forgotten. */
export function ActiveSessionBanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { session, elapsedMs } = useActiveSession();
  const running = session?.timer_state === 'running';
  const now = useNow(!!session && running);
  if (!session) return null;
  return (
    <Pressable
      onPress={() => router.navigate('/study')}
      accessibilityRole="button"
      accessibilityLabel={`${running ? 'Studying' : 'Paused'} ${session.subject_name}, ${formatClock(elapsedMs(now))}. Open timer`}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.9 }]}>
      <SubjectDot color={session.subject_color} size={10} />
      <View style={styles.flex}>
        <AppText variant="smallStrong" color={colors.onInverse} numberOfLines={1}>
          {running ? 'Studying' : 'Paused'} · {session.subject_name}
        </AppText>
      </View>
      <AppText variant="bodyStrong" color={colors.onInverse} style={styles.clock}>
        {formatClock(elapsedMs(now))}
      </AppText>
      <Icon name="chevronRight" size={18} color={colors.onInverse} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.inverse,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 52,
  },
  flex: { flex: 1 },
  clock: { fontFamily: SANS.semibold, fontVariant: ['tabular-nums'] },
}));
