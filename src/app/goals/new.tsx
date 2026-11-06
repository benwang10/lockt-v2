import { useState } from 'react';
import { View } from 'react-native';

import { SubjectDot } from '@/components/subject-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow, Segmented } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Banner } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { createGoal, fetchSubjects } from '@/lib/api/subjects';
import { friendlyError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import { goBackOr } from '@/lib/navigation';
import type { GoalKind } from '@/lib/types';
import { LIMITS } from '@/lib/validation';
import { WEEK_DEFINITION_TEXT, addLocalDays } from '@/lib/week';
import { useMe } from '@/providers/auth';
import { makeStyles, useTheme } from '@/providers/theme';

const HOUR_PRESETS = [2, 5, 8, 10, 15];

function toDateString(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function NewGoalScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userId } = useMe();
  const subjects = useQuery(() => fetchSubjects(userId), [userId]);
  const [kind, setKind] = useState<GoalKind>('weekly_time');
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('5');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeSubjects = (subjects.data ?? []).filter((s) => !s.archived_at);
  const today = new Date();
  const datePresets = [
    { label: 'In 1 week', value: toDateString(addLocalDays(today, 7)) },
    { label: 'In 2 weeks', value: toDateString(addLocalDays(today, 14)) },
    { label: 'In a month', value: toDateString(addLocalDays(today, 30)) },
  ];

  const save = async () => {
    setError(null);
    const hoursNumber = Number(hours.replace(',', '.'));
    const minutes = Math.round(hoursNumber * 60);
    if (kind === 'weekly_time' && (!Number.isFinite(hoursNumber) || minutes < 15 || minutes > 168 * 60)) {
      setError('Choose between 0.25 and 168 hours per week.');
      return;
    }
    if (kind === 'milestone' && !title.trim()) {
      setError('Name the milestone, e.g. “Finish CS 31 practice exam”.');
      return;
    }
    if (kind === 'milestone' && targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setError('Use the date format YYYY-MM-DD.');
      return;
    }
    const subjectName = activeSubjects.find((s) => s.id === subjectId)?.name;
    const autoTitle = `Study ${hoursNumber}h/week${subjectName ? ` · ${subjectName}` : ''}`;
    setSaving(true);
    try {
      await createGoal({
        userId,
        kind,
        title: (title.trim() || autoTitle).slice(0, LIMITS.goalTitle),
        subjectId,
        weeklyTargetMinutes: minutes,
        targetDate: targetDate || null,
      });
      invalidate('goals');
      goBackOr('/progress');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} footer={<Button title="Create goal" size="lg" onPress={save} loading={saving} />}>
      <Segmented
        options={[
          { value: 'weekly_time', label: 'Weekly time' },
          { value: 'milestone', label: 'Milestone' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {error ? <Banner tone="danger" message={error} /> : null}

      {kind === 'weekly_time' ? (
        <Card>
          <AppText variant="heading">Hours per week</AppText>
          <ChipRow>
            {HOUR_PRESETS.map((h) => (
              <Chip key={h} label={`${h}h`} selected={hours === String(h)} onPress={() => setHours(String(h))} />
            ))}
          </ChipRow>
          <TextField label="Custom hours" value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
          <AppText variant="caption" color={colors.textSecondary}>
            {WEEK_DEFINITION_TEXT} Progress resets every Monday. Private and shared sessions both count.
          </AppText>
          <TextField label="Name (optional)" value={title} onChangeText={setTitle} maxLength={LIMITS.goalTitle} placeholder="e.g. Steady calculus practice" />
        </Card>
      ) : (
        <Card>
          <TextField
            label="Milestone"
            value={title}
            onChangeText={setTitle}
            maxLength={LIMITS.goalTitle}
            placeholder="e.g. Finish CS 31 practice exam"
          />
          <AppText variant="smallStrong">Target date (optional)</AppText>
          <ChipRow>
            <Chip label="No date" selected={!targetDate} onPress={() => setTargetDate('')} />
            {datePresets.map((p) => (
              <Chip key={p.label} label={p.label} selected={targetDate === p.value} onPress={() => setTargetDate(p.value)} />
            ))}
          </ChipRow>
          <TextField label="Or enter a date" value={targetDate} onChangeText={setTargetDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          <AppText variant="caption" color={colors.textSecondary}>
            You mark milestones complete yourself — time spent doesn’t automatically prove it’s done.
          </AppText>
        </Card>
      )}

      <Card>
        <AppText variant="heading">Subject (optional)</AppText>
        <ChipRow>
          <Chip label="All subjects" selected={subjectId === null} onPress={() => setSubjectId(null)} />
          {activeSubjects.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              color={s.color}
              selected={subjectId === s.id}
              onPress={() => setSubjectId(s.id)}
              leading={<SubjectDot color={s.color} />}
            />
          ))}
        </ChipRow>
      </Card>
      <View style={styles.spacer} />
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({ spacer: { height: Spacing.lg } }));
