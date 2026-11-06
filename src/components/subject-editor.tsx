import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing, SubjectColors } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { LIMITS } from '@/lib/validation';
import { makeStyles } from '@/providers/theme';

export function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Subject colour">
      {SubjectColors.map((c, i) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="radio"
            accessibilityLabel={`Colour ${i + 1}`}
            accessibilityState={{ selected, checked: selected }}
            style={[styles.swatch, { backgroundColor: c }, selected && styles.swatchSelected]}>
            {selected ? <Icon name="check" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Name + colour form used to create or edit a subject. */
export function SubjectEditor({
  initialName = '',
  initialColor = SubjectColors[0],
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

  const submit = async () => {
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
  };

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

const useStyles = makeStyles((c) => ({
  editor: { gap: Spacing.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3, borderColor: c.text },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
}));
