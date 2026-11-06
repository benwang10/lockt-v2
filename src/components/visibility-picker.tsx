import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';
import type { Visibility } from '@/lib/types';
import { makeStyles, useTheme } from '@/providers/theme';

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string }[] = [
  {
    value: 'followers',
    label: 'Followers',
    description:
      'People who follow you see this session, its photo and song in their feed, and can like and comment. You can invite study buddies.',
  },
  {
    value: 'private',
    label: 'Only me',
    description: 'Only you can see this session. It still counts toward your goals and progress.',
  },
];

/** "Who can see this?" as a radio group: text labels, a clear selected state and an explanation per audience. */
export function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Who can see this?">
      {VISIBILITY_OPTIONS.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={`${o.label}. ${o.description}`}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accentSoft : pressed ? colors.surfaceMuted : colors.surface,
                borderWidth: selected ? 2 : 1,
                margin: selected ? 0 : 1,
              },
            ]}>
            <Icon name={selected ? 'checkCircle' : 'circle'} size={22} color={selected ? colors.accent : colors.textSecondary} />
            <View style={styles.text}>
              <AppText variant="bodyStrong" color={selected ? colors.accentStrong : colors.text}>
                {o.label}
              </AppText>
              <AppText variant="small" color={colors.textSecondary}>
                {o.description}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  group: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    minHeight: TOUCH_TARGET,
  },
  text: { flex: 1, gap: Spacing.xxs },
}));
