import { View } from 'react-native';

import { StudyBackground, STUDY_BACKGROUNDS, useStudyBackground } from '@/components/study-background';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { makeStyles, useTheme } from '@/providers/theme';

/**
 * Choose the calm animated background shown while a session runs. The choice
 * is saved on this device. With `preview`, a small live sample is shown.
 */
export function BackgroundPicker({ preview = false }: { preview?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [kind, setKind] = useStudyBackground();
  return (
    <View style={styles.wrap}>
      <AppText variant="heading">Study background</AppText>
      {/* Wrapping chips (not a segmented bar) so labels never break on narrow phones. */}
      <ChipRow>
        {STUDY_BACKGROUNDS.map((b) => (
          <Chip
            key={b.value}
            label={b.label}
            selected={kind === b.value}
            onPress={() => setKind(b.value)}
            leading={<Icon name={b.icon} size={16} color={kind === b.value ? colors.accentStrong : colors.textSecondary} />}
            accessibilityLabel={`Study background: ${b.label}`}
          />
        ))}
      </ChipRow>
      {preview ? (
        <View style={styles.preview} accessibilityLabel={`Preview of the ${kind} background`}>
          <StudyBackground kind={kind} animate />
          <AppText style={styles.previewClock} color={colors.text}>
            25:00
          </AppText>
        </View>
      ) : null}
      <AppText variant="caption" color={colors.textMuted}>
        Shown behind the timer while you study. Calm and still when the session is paused or your device asks for
        reduced motion. Saved on this device.
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: Spacing.md },
  preview: {
    height: 132,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  previewClock: { ...Type.timer, fontSize: 40, lineHeight: 50 },
}));
