export type Mood = 'focused' | 'motivated' | 'calm' | 'proud' | 'tired' | 'frustrated';

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 'focused', emoji: '🎯', label: 'Focused' },
  { value: 'motivated', emoji: '🔥', label: 'Motivated' },
  { value: 'calm', emoji: '😌', label: 'Calm' },
  { value: 'proud', emoji: '🥳', label: 'Proud' },
  { value: 'tired', emoji: '😴', label: 'Tired' },
  { value: 'frustrated', emoji: '😤', label: 'Frustrated' },
];

export function moodInfo(mood: Mood | null | undefined) {
  return MOODS.find((m) => m.value === mood) ?? null;
}
