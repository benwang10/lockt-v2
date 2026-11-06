import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackgroundPicker } from '@/components/background-picker';
import { StudyBackground, useStudyBackground } from '@/components/study-background';
import { SubjectEditor } from '@/components/subject-editor';
import { SubjectDot, SubjectPill } from '@/components/subject-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Banner, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing, tint, Type } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { createSubject, fetchGoals, fetchSubjects } from '@/lib/api/subjects';
import { confirmAction } from '@/lib/confirm';
import { invalidate } from '@/lib/events';
import { formatClock } from '@/lib/time';
import { LONG_SESSION_WARNING_MS } from '@/lib/timer';
import { LIMITS } from '@/lib/validation';
import { useActiveSession, useNow } from '@/providers/active-session';
import { useMe } from '@/providers/auth';
import { makeStyles, useTheme } from '@/providers/theme';

export default function StudyScreen() {
  const active = useActiveSession();
  if (!active.hydrated) return <LoadingState />;
  return active.session ? <ActiveTimer /> : <StartSession />;
}

// ---------------------------------------------------------------------------
// Start form
// ---------------------------------------------------------------------------

function StartSession() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userId } = useMe();
  const active = useActiveSession();
  const subjects = useQuery(() => fetchSubjects(userId), [userId], { topics: ['subjects'] });
  const goals = useQuery(() => fetchGoals(userId), [userId], { topics: ['goals'] });
  // Restore choices from a failed start so a retry uses the same values.
  const failedStart = active.pending?.kind === 'start' ? active.pending : null;
  const [chosenSubjectId, setSubjectId] = useState<string | null>(failedStart?.subjectId ?? null);
  const [goalId, setGoalId] = useState<string | null>(failedStart?.goalId ?? null);
  const [intention, setIntention] = useState(failedStart?.intention ?? '');
  const [creating, setCreating] = useState(false);

  const activeSubjects = (subjects.data ?? []).filter((s) => !s.archived_at);
  const openGoals = (goals.data ?? []).filter((g) => !(g.kind === 'milestone' && g.completed_at));
  // Fall back to the first subject if nothing (valid) is selected.
  const subjectId = activeSubjects.some((s) => s.id === chosenSubjectId) ? chosenSubjectId : (activeSubjects[0]?.id ?? null);

  if (subjects.loading) return <LoadingState />;
  if (subjects.error && !subjects.data) return <ErrorState message={subjects.error} onRetry={subjects.reload} />;

  const start = async () => {
    if (!subjectId) return;
    const ok = await active.start({ subjectId, intention: intention.trim() || null, goalId });
    if (ok) setIntention('');
  };

  const noSubjects = activeSubjects.length === 0;

  return (
    <Screen
      scroll
      refreshing={subjects.refreshing}
      onRefresh={() => {
        subjects.refresh();
        goals.refresh();
        active.refresh();
      }}
      footer={
        noSubjects && !creating ? null : (
          <Button
            title={active.pending?.kind === 'start' ? 'Retry start' : 'Start studying'}
            icon="play"
            size="lg"
            onPress={start}
            loading={active.busy === 'start'}
            disabled={!subjectId}
            accessibilityHint="Starts the stopwatch for the selected subject"
          />
        )
      }>
      <View style={styles.headerBlock}>
        <AppText variant="title" accessibilityRole="header">
          Ready to focus?
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          Pick a subject, set an intention, and start the stopwatch. You can pause anytime — paused time doesn’t count.
        </AppText>
      </View>

      {active.notice ? <Banner tone="info" message={active.notice} actionLabel="OK" onAction={active.clearMessages} /> : null}
      {active.actionError ? (
        <Banner
          tone="danger"
          message={
            active.pending?.kind === 'start'
              ? `${active.actionError} Your session hasn’t started yet.`
              : active.actionError
          }
          actionLabel={active.pending ? 'Retry' : undefined}
          onAction={active.retryPending}
          secondaryLabel="Dismiss"
          onSecondary={active.dismissPending}
        />
      ) : null}

      <Card>
        <AppText variant="heading">Subject</AppText>
        {noSubjects && !creating ? (
          <View style={styles.firstSubject}>
            <AppText variant="body" color={colors.textSecondary}>
              Create your first subject — a class, exam or skill you’re working on.
            </AppText>
            <Button title="Create a subject" icon="plus" onPress={() => setCreating(true)} />
          </View>
        ) : creating ? (
          <SubjectEditor
            submitLabel="Add subject"
            onCancel={() => setCreating(false)}
            onSubmit={async (name, color) => {
              const created = await createSubject(userId, name, color);
              invalidate('subjects');
              await subjects.reload();
              setSubjectId(created.id);
              setCreating(false);
            }}
          />
        ) : (
          <>
            <ChipRow>
              {activeSubjects.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  color={s.color}
                  selected={s.id === subjectId}
                  onPress={() => setSubjectId(s.id)}
                  leading={<SubjectDot color={s.color} />}
                />
              ))}
              <Chip label="New" selected={false} onPress={() => setCreating(true)} leading={<Icon name="plus" size={16} />} accessibilityLabel="New subject" />
            </ChipRow>
            <Button title="Manage subjects" variant="ghost" size="sm" icon="settings" onPress={() => router.push('/subjects')} style={styles.alignStart} />
          </>
        )}
      </Card>

      {!noSubjects ? (
        <Card>
          <TextField
            label="Intention (optional)"
            value={intention}
            onChangeText={setIntention}
            placeholder="e.g. Finish practice problems on functions"
            multiline
            maxLength={LIMITS.intention}
            showCount
          />
          {openGoals.length > 0 ? (
            <View style={styles.goalBlock}>
              <AppText variant="smallStrong">Working toward a goal? (optional)</AppText>
              <ChipRow>
                <Chip label="No goal" selected={goalId === null} onPress={() => setGoalId(null)} />
                {openGoals.map((g) => (
                  <Chip
                    key={g.id}
                    label={g.title}
                    selected={goalId === g.id}
                    onPress={() => setGoalId(g.id)}
                    leading={<Icon name={g.kind === 'milestone' ? 'flag' : 'target'} size={16} />}
                  />
                ))}
              </ChipRow>
            </View>
          ) : null}
        </Card>
      ) : null}

      {!noSubjects ? (
        <Card>
          <BackgroundPicker preview />
        </Card>
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Running / paused timer
// ---------------------------------------------------------------------------

function ActiveTimer() {
  const { colors } = useTheme();
  const styles = useStyles();
  const active = useActiveSession();
  const session = active.session!;
  const running = session.timer_state === 'running';
  const now = useNow(running);
  const elapsed = active.elapsedMs(now);
  const color = session.subject_color;
  const [background] = useStudyBackground();

  const finish = async () => {
    const done = await active.finish();
    if (done) router.push({ pathname: '/session/[id]/edit', params: { id: done.id, fresh: '1' } });
  };

  const discard = async () => {
    const ok = await confirmAction({
      title: 'Discard this session?',
      message: 'The time will not be saved or counted toward your goals.',
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (ok) await active.discard();
  };

  const pendingMessage = (() => {
    const p = active.pending;
    if (!p) return null;
    const at = 'at' in p ? new Date(p.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    switch (p.kind) {
      case 'finish':
        return `You tapped Finish at ${at}, but it hasn’t reached the server yet. Your session is safe — retry when you’re back online.`;
      case 'pause':
        return `Pause at ${at} wasn’t saved yet. The timer is still running on the server.`;
      case 'resume':
        return 'Resume wasn’t saved yet. The session is still paused.';
      case 'discard':
        return 'Discard wasn’t saved yet. The session still exists.';
      default:
        return null;
    }
  })();

  return (
    <Screen
      scroll
      onRefresh={active.refresh}
      refreshing={active.syncing}
      // Decorative only; the clock above reads persisted timestamps.
      background={<StudyBackground kind={background} animate={running} />}
      footer={
        <View style={styles.controls}>
          <Button
            title={running ? 'Pause' : 'Resume'}
            icon={running ? 'pause' : 'play'}
            variant="secondary"
            size="lg"
            style={styles.flex}
            onPress={running ? active.pause : active.resume}
            loading={active.busy === 'pause' || active.busy === 'resume'}
            disabled={!!active.busy && active.busy !== 'pause' && active.busy !== 'resume'}
          />
          <Button
            title={active.pending?.kind === 'finish' ? 'Retry finish' : 'Finish'}
            icon="stop"
            size="lg"
            style={styles.flex}
            onPress={finish}
            loading={active.busy === 'finish'}
            disabled={!!active.busy && active.busy !== 'finish'}
            accessibilityHint="Stops the timer and saves the session privately"
          />
        </View>
      }>
      {active.notice ? <Banner tone="info" message={active.notice} actionLabel="OK" onAction={active.clearMessages} /> : null}
      {pendingMessage ? (
        <Banner tone="warning" message={pendingMessage} actionLabel="Retry" onAction={active.retryPending} secondaryLabel="Dismiss" onSecondary={active.dismissPending} />
      ) : active.actionError ? (
        <Banner tone="danger" message={active.actionError} secondaryLabel="Dismiss" onSecondary={active.clearMessages} />
      ) : null}
      {active.syncError && !active.synced ? (
        <Banner
          tone="warning"
          message="Showing your saved timer — couldn’t confirm it with the server yet."
          actionLabel="Retry"
          onAction={active.refresh}
        />
      ) : null}

      {/* Opaque surface + subject wash: readable over any study background, in both themes. */}
      <View style={[styles.timerCard, { borderColor: tint(color, 0.35) }]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint(color, 0.1) }]} />
        <SubjectPill name={session.subject_name} color={color} />
        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: running ? color : colors.textMuted }]} />
          <AppText variant="smallStrong" color={colors.textSecondary}>
            {running ? 'Studying' : 'Paused'}
          </AppText>
        </View>
        <AppText
          style={[Type.timer, styles.clock]}
          accessibilityRole="timer"
          accessibilityLabel={`Elapsed study time ${formatClock(elapsed)}`}
          adjustsFontSizeToFit
          numberOfLines={1}>
          {formatClock(elapsed)}
        </AppText>
        {session.intention ? (
          <View style={styles.intention}>
            <AppText variant="overline" color={colors.textSecondary}>
              INTENTION
            </AppText>
            <AppText variant="body">{session.intention}</AppText>
          </View>
        ) : null}
        <AppText variant="caption" color={colors.textSecondary}>
          Started {new Date(session.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </AppText>
      </View>

      {elapsed > LONG_SESSION_WARNING_MS ? (
        <Banner
          tone="warning"
          message="This session has been running a long time. Forgot to stop? Discard it if it doesn’t reflect real study (sessions are capped at 24h)."
        />
      ) : null}

      <Card>
        <BackgroundPicker />
      </Card>

      <Button title="Discard session" variant="dangerGhost" icon="trash" onPress={discard} loading={active.busy === 'discard'} disabled={!!active.busy && active.busy !== 'discard'} />
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  headerBlock: { gap: Spacing.xs },
  firstSubject: { gap: Spacing.md },
  goalBlock: { gap: Spacing.sm },
  alignStart: { alignSelf: 'flex-start' },
  timerCard: {
    backgroundColor: c.surface,
    overflow: 'hidden',
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    gap: Spacing.md,
    alignItems: 'center',
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  clock: { color: c.text, textAlign: 'center', alignSelf: 'stretch' },
  intention: {
    alignSelf: 'stretch',
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 2,
  },
  controls: { flexDirection: 'row', gap: Spacing.md },
  flex: { flex: 1 },
}));
