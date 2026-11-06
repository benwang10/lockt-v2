import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing, TOUCH_TARGET, type ThemeColors } from '@/constants/theme';
import { makeStyles, useTheme } from '@/providers/theme';

import { Icon, type IconName } from './icon';
import { AppText } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';

function variantColors(c: ThemeColors, variant: Variant): { bg: string; bgPressed: string; fg: string; border?: string } {
  switch (variant) {
    case 'primary':
      return { bg: c.accent, bgPressed: c.accentStrong, fg: c.onAccent };
    case 'secondary':
      return { bg: c.surface, bgPressed: c.surfaceMuted, fg: c.text, border: c.border };
    case 'ghost':
      return { bg: 'transparent', bgPressed: c.surfaceMuted, fg: c.accent };
    case 'danger':
      return { bg: c.danger, bgPressed: c.dangerPressed, fg: c.onDanger };
    case 'dangerGhost':
      return { bg: 'transparent', bgPressed: c.dangerSoft, fg: c.danger };
  }
}

const HEIGHTS = { sm: 36, md: 48, lg: 56 } as const;

/**
 * Shared button. Content (icon + label) is always centred as one unit, the
 * label wraps to two centred lines instead of clipping at large text sizes,
 * and the loading spinner is overlaid on the (invisible) label so the button
 * keeps its width and position while busy.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  style,
  accessibilityHint,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const v = variantColors(colors, variant);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: Math.max(HEIGHTS[size], size === 'sm' ? 36 : TOUCH_TARGET),
          backgroundColor: pressed ? v.bgPressed : v.bg,
          borderColor: v.border ?? 'transparent',
          paddingHorizontal: size === 'sm' ? Spacing.md : Spacing.xl,
          opacity: isDisabled && !loading ? 0.5 : 1,
        },
        style,
      ]}>
      <View style={[styles.row, loading && styles.hidden]}>
        {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 20} color={v.fg} /> : null}
        <AppText
          variant={size === 'sm' ? 'smallStrong' : 'bodyStrong'}
          color={v.fg}
          numberOfLines={2}
          style={styles.label}>
          {title}
        </AppText>
      </View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={v.fg} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Round icon-only button with a proper touch target and label. */
export function IconButton({
  icon,
  label,
  onPress,
  color,
  size = 22,
  disabled,
  style,
  children,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Optional overlay such as an unread dot. */
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: pressed ? colors.surfaceMuted : 'transparent', opacity: disabled ? 0.4 : 1 },
        style,
      ]}>
      <Icon name={icon} size={size} color={color ?? colors.text} />
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  base: {
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    maxWidth: '100%',
  },
  label: { textAlign: 'center', flexShrink: 1 },
  hidden: { opacity: 0 },
  spinner: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
