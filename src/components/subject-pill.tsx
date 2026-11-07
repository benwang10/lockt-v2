import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Radius, Spacing, subjectColor, tint } from '@/constants/theme';
import { makeStyles, useTheme } from '@/providers/theme';

/** Subject colours are resolved through subjectColor(): invalid/missing values draw forest green. */
export function SubjectDot({ color, size = 10 }: { color: string | null | undefined; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: subjectColor(color) }} />;
}

export function SubjectPill({ name, color }: { name: string; color: string | null | undefined }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.pill, { backgroundColor: tint(subjectColor(color), 0.14) }]} accessibilityLabel={`Subject: ${name}`}>
      <SubjectDot color={color} size={8} />
      <AppText variant="label" color={colors.text} numberOfLines={1} style={styles.text}>
        {name}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    maxWidth: '100%',
  },
  text: { flexShrink: 1 },
}));
