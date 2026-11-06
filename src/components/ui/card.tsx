import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

import { AppText } from './text';
import { makeStyles } from '@/providers/theme';

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {action}
    </View>
  );
}

const useStyles = makeStyles((c, { shadow }) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    ...shadow,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
}));
