import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { StudyBackground, STUDY_BACKGROUNDS, useStudyBackground, type StudyBackgroundKind } from '@/components/study-background';
import { IconButton } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing, TOUCH_TARGET, Type } from '@/constants/theme';
import { checkedA11y, webSpaceActivates } from '@/lib/a11y';
import { makeStyles, useTheme } from '@/providers/theme';

/**
 * Choose the calm animated background shown while a session runs. The choice
 * is saved on this device. With `preview`, a small live sample is shown.
 * Used on the start form; during a session the compact BackgroundControl is used.
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

/**
 * Compact control for the running timer: a small icon button showing the
 * current background. Tapping it expands a panel of preview tiles (Off, Rain,
 * Bubbles, Leaves); the X, the button again, or "Done" closes it. The tiles
 * are still frames so the panel adds no animation work.
 */
export function BackgroundControl() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [kind, setKind] = useStudyBackground();
  const [open, setOpen] = useState(false);
  const current = STUDY_BACKGROUNDS.find((b) => b.value === kind) ?? STUDY_BACKGROUNDS[0];
  return (
    <View style={styles.control}>
      <View style={styles.toggleRow}>
        <IconButton
          icon={open ? 'close' : current.icon}
          label={open ? 'Close study background options' : `Study background: ${current.label}. Change`}
          onPress={() => setOpen((v) => !v)}
          color={kind === 'off' && !open ? colors.textSecondary : colors.accentStrong}
          size={20}
          expanded={open}
          style={[styles.toggle, open && styles.toggleOpen]}
        />
      </View>
      {open ? (
        <View style={styles.panel} testID="background-panel">
          <View style={styles.panelHeader}>
            <AppText variant="smallStrong">Study background</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              Saved on this device
            </AppText>
          </View>
          <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="Study background">
            {STUDY_BACKGROUNDS.map((b) => (
              <BackgroundTile key={b.value} kind={b.value} label={b.label} selected={kind === b.value} onSelect={() => setKind(b.value)} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function BackgroundTile({
  kind,
  label,
  selected,
  onSelect,
}: {
  kind: StudyBackgroundKind;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      {...checkedA11y(selected)}
      {...webSpaceActivates(onSelect)}
      accessibilityLabel={`Study background: ${label}`}
      style={({ pressed }) => [styles.tile, { borderColor: selected ? colors.accent : colors.border }, selected && styles.tileSelected, pressed && styles.tilePressed]}>
      <View style={styles.tilePreview}>
        <StudyBackground kind={kind} animate={false} />
        {kind === 'off' ? <Icon name="stopCircle" size={18} color={colors.textMuted} /> : null}
      </View>
      <View style={styles.tileLabel}>
        {selected ? <Icon name="checkCircle" size={14} color={colors.accent} /> : null}
        <AppText variant="label" color={selected ? colors.accentStrong : colors.textSecondary} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </Pressable>
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
  control: { gap: Spacing.sm },
  toggleRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  toggle: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, width: TOUCH_TARGET, height: TOUCH_TARGET },
  toggleOpen: { backgroundColor: c.accentSoft, borderColor: c.accent },
  panel: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm, flexWrap: 'wrap' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 68,
    borderRadius: Radius.md,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: c.background,
  },
  tileSelected: { backgroundColor: c.accentSoft },
  tilePressed: { opacity: 0.8 },
  tilePreview: { height: 56, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: c.background },
  tileLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.xs + 2,
    minHeight: 30,
  },
}));
