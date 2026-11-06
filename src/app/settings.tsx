import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Banner } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { updateHighlightStat } from '@/lib/api/profiles';
import { friendlyError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import { HIGHLIGHT_OPTIONS, HIGHLIGHT_PRIVACY_NOTE } from '@/lib/highlight';
import type { HighlightStat } from '@/lib/types';
import { useAuth, useMe } from '@/providers/auth';
import { makeStyles, useTheme, type AppearancePreference } from '@/providers/theme';

const APPEARANCE_OPTIONS: { value: AppearancePreference; label: string; icon: 'settings' | 'sun' | 'moon'; accessibilityLabel: string }[] = [
  { value: 'system', label: 'System', icon: 'settings', accessibilityLabel: 'Appearance: match system setting' },
  { value: 'light', label: 'Light', icon: 'sun', accessibilityLabel: 'Appearance: light' },
  { value: 'dark', label: 'Dark', icon: 'moon', accessibilityLabel: 'Appearance: dark' },
];

export default function SettingsScreen() {
  const { colors, preference, setPreference, scheme } = useTheme();
  const styles = useStyles();
  const { userId, profile } = useMe();
  const { setProfile } = useAuth();
  const [saving, setSaving] = useState<HighlightStat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chooseHighlight = async (value: HighlightStat) => {
    if (value === profile.highlight_stat || saving) return;
    setSaving(value);
    setError(null);
    try {
      const updated = await updateHighlightStat(userId, value);
      setProfile(updated);
      invalidate('profile');
    } catch (e) {
      setError(`Not saved: ${friendlyError(e)}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen scroll edges={['bottom', 'left', 'right']}>
      <Card>
        <View style={styles.header}>
          <AppText variant="heading" accessibilityRole="header">
            Appearance
          </AppText>
          <AppText variant="small" color={colors.textSecondary}>
            {preference === 'system'
              ? `Following your device (currently ${scheme}).`
              : `Always ${preference}. Saved on this device.`}
          </AppText>
        </View>
        <Segmented options={APPEARANCE_OPTIONS} value={preference} onChange={setPreference} />
        <AppText variant="caption" color={colors.textMuted}>
          Switching never interrupts a running study session.
        </AppText>
      </Card>

      <Card>
        <View style={styles.header}>
          <AppText variant="heading" accessibilityRole="header">
            Profile highlight
          </AppText>
          <AppText variant="small" color={colors.textSecondary}>
            One statistic featured at the top of your profile. Weeks start Monday 00:00 in your time zone.
          </AppText>
        </View>
        {error ? <Banner tone="danger" message={error} /> : null}
        <View accessibilityRole="radiogroup" accessibilityLabel="Profile highlight" style={styles.options}>
          {HIGHLIGHT_OPTIONS.map((o) => {
            const selected = (saving ?? profile.highlight_stat) === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => chooseHighlight(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected, busy: saving === o.value }}
                accessibilityLabel={`${o.label}. ${o.description}`}
                style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && !selected && styles.optionPressed]}>
                <Icon name={selected ? 'checkCircle' : 'circle'} size={22} color={selected ? colors.accent : colors.textSecondary} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{o.label}</AppText>
                  <AppText variant="small" color={colors.textSecondary}>
                    {o.description}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.note}>
          <Icon name="lock" size={16} color={colors.textSecondary} />
          <AppText variant="small" color={colors.textSecondary} style={styles.flex}>
            {HIGHLIGHT_PRIVACY_NOTE}
          </AppText>
        </View>
      </Card>
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  header: { gap: Spacing.xxs },
  options: { gap: Spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    minHeight: TOUCH_TARGET,
  },
  optionSelected: { backgroundColor: c.accentSoft },
  optionPressed: { backgroundColor: c.surfaceMuted },
  note: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
}));
