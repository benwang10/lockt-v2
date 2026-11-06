import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { AppText } from './text';
import { makeStyles, useTheme } from '@/providers/theme';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.accent} size="large" />
      <AppText variant="small" color={colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  message,
  children,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.center}>
      <View style={styles.iconBubble}>
        <Icon name={icon} size={30} color={colors.accent} />
      </View>
      <AppText variant="heading" style={styles.centerText}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" color={colors.textSecondary} style={styles.centerText}>
          {message}
        </AppText>
      ) : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  title = "Couldn't load this",
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <View style={[styles.iconBubble, { backgroundColor: colors.dangerSoft }]}>
        <Icon name="offline" size={28} color={colors.danger} />
      </View>
      <AppText variant="heading" style={styles.centerText}>
        {title}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={styles.centerText}>
        {message}
      </AppText>
      {onRetry ? (
        <View style={styles.actions}>
          <Button title="Try again" icon="refresh" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

/** Inline notice for recoverable problems (unsaved changes, offline, etc.). */
export function Banner({
  tone = 'info',
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const palette = {
    info: { bg: colors.accentSoft, fg: colors.accentStrong, icon: 'info' as const },
    success: { bg: colors.accentSoft, fg: colors.accentStrong, icon: 'checkCircle' as const },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'clock' as const },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'offline' as const },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <View style={styles.bannerRow}>
        <Icon name={palette.icon} size={18} color={palette.fg} />
        <AppText variant="small" color={palette.fg} style={styles.flex}>
          {message}
        </AppText>
      </View>
      {actionLabel || secondaryLabel ? (
        <View style={styles.bannerActions}>
          {secondaryLabel ? <Button title={secondaryLabel} size="sm" variant="ghost" onPress={onSecondary} /> : null}
          {actionLabel ? <Button title={actionLabel} size="sm" variant="secondary" onPress={onAction} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1 },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  centerText: { textAlign: 'center', maxWidth: 420 },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  // Centred, full-width up to 360pt. (alignSelf 'stretch' + maxWidth used to
  // pin this column to the left edge on wide phones, tablets and the web.)
  actions: { gap: Spacing.sm, marginTop: Spacing.sm, alignSelf: 'center', maxWidth: 360, width: '100%' },
  banner: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  bannerRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  bannerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.sm },
}));
