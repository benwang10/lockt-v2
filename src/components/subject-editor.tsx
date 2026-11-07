import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { DEFAULT_SUBJECT_COLOR, onSubjectColor, Spacing, subjectColor, subjectColorName, SubjectColors } from '@/constants/theme';
import { checkedA11y, webSpaceActivates } from '@/lib/a11y';
import { friendlyError } from '@/lib/errors';
import { LIMITS } from '@/lib/validation';
import { makeStyles, useTheme } from '@/providers/theme';
import { useSingleSubmit } from '@/hooks/use-single-submit';

/**
 * Wrapping grid of subject colours. The selected swatch gets a ring in the
 * text colour plus a check mark drawn in whichever of dark/white contrasts
 * best with the swatch. A saved colour that isn't in the palette (older or
 * custom value) is shown first, so editing never silently changes it.
 */
export function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const current = subjectColor(value);
  const inPalette = SubjectColors.some((c) => c.toLowerCase() === current.toLowerCase());
  const options = inPalette ? SubjectColors : [current, ...SubjectColors];
  return (
    <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Subject colour">
      {options.map((c) => {
        const selected = c.toLowerCase() === current.toLowerCase();
        const name = subjectColorName(c);
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="radio"
            accessibilityLabel={name === 'Custom colour' ? 'Current colour' : name}
            {...checkedA11y(selected)}
            {...webSpaceActivates(() => onChange(c))}
            hitSlop={2}
            style={({ pressed }) => [
              styles.swatchRing,
              { borderColor: selected ? colors.text : 'transparent' },
              pressed && !selected && styles.swatchPressed,
            ]}>
            <View style={[styles.swatch, { backgroundColor: c }]}>
              {selected ? <Icon name="check" size={18} color={onSubjectColor(c)} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Name + colour form used to create or edit a subject. */
export function SubjectEditor({
  initialName = '',
  initialColor = DEFAULT_SUBJECT_COLOR,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialColor?: string;
  submitLabel: string;
  onSubmit: (name: string, color: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const styles = useStyles();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = useSingleSubmit(async () => {
    if (!name.trim()) {
      setError('Give the subject a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim(), color);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  });

  return (
    <View style={styles.editor}>
      <TextField
        label="Subject name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. CS 31, Calculus, Interview Prep"
        maxLength={LIMITS.subjectName}
        error={error}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <AppText variant="smallStrong">Colour</AppText>
      <ColorSwatches value={color} onChange={setColor} />
      <View style={styles.actions}>
        {onCancel ? <Button title="Cancel" variant="ghost" onPress={onCancel} /> : null}
        <Button title={submitLabel} onPress={submit} loading={saving} style={styles.flex} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  editor: { gap: Spacing.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginHorizontal: -2 },
  // 48pt touch target: a 2.5pt ring with a 3pt gap around a 36pt swatch.
  swatchRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchPressed: { opacity: 0.75 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
}));
