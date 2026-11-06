import { AppText } from '@/components/ui/text';
import { Chip, ChipRow } from '@/components/ui/chip';
import { MOODS, type Mood } from '@/constants/moods';

export function MoodPicker({ value, onChange }: { value: Mood | null; onChange: (m: Mood | null) => void }) {
  return (
    <ChipRow>
      {MOODS.map((m) => (
        <Chip
          key={m.value}
          label={m.label}
          selected={value === m.value}
          onPress={() => onChange(value === m.value ? null : m.value)}
          leading={<AppText accessibilityElementsHidden>{m.emoji}</AppText>}
          accessibilityLabel={`Mood: ${m.label}`}
        />
      ))}
    </ChipRow>
  );
}
