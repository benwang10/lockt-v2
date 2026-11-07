import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';

import { checkedA11y, webSpaceActivates } from '@/lib/a11y';
import { makeStyles, useTheme } from '@/providers/theme';

import { Icon, type IconName } from './icon';
import { AppText } from './text';

/** Selectable chip (radio-like). */
export function Chip({
  label,
  selected,
  onPress,
  leading,
  color,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
  /** Optional colour used for the selected state (e.g. subject colour). */
  color?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const active = color ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      {...checkedA11y(selected)}
      {...webSpaceActivates(onPress)}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? active : colors.border,
          backgroundColor: selected ? `${active}1F` : pressed ? colors.surfaceMuted : colors.surface,
          // Thicker selected border is compensated by margin: neighbours never shift.
          borderWidth: selected ? 2 : 1,
          margin: selected ? 0 : 1,
        },
      ]}>
      {leading}
      <AppText variant="smallStrong" color={colors.text} numberOfLines={1} style={styles.chipLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {children}
    </View>
  );
}

/** Two or three option segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            {...checkedA11y(selected)}
            {...webSpaceActivates(() => onChange(o.value))}
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            style={[styles.segment, selected && styles.segmentSelected]}>
            {o.icon ? <Icon name={o.icon} size={16} color={selected ? colors.accentStrong : colors.textSecondary} /> : null}
            <AppText
              variant="smallStrong"
              color={selected ? colors.text : colors.textSecondary}
              numberOfLines={2}
              style={styles.segmentLabel}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: Radius.pill,
    maxWidth: '100%',
  },
  chipLabel: { flexShrink: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  segmented: {
    flexDirection: 'row',
    backgroundColor: c.surfaceMuted,
    borderRadius: Radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm + 2,
  },
  segmentSelected: {
    backgroundColor: c.surface,
    shadowColor: c.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentLabel: { textAlign: 'center', flexShrink: 1 },
}));
