import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveSessionBanner } from '@/components/active-session-banner';
import { SessionCard } from '@/components/session-card';
import { SubjectDot } from '@/components/subject-pill';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Banner, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { ProgressBar, WeekChart } from '@/components/week-chart';
import { MAX_CONTENT_WIDTH, Radius, Spacing } from '@/constants/theme';
import { useLikeToggle } from '@/hooks/use-like-toggle';
import { usePagedSessions } from '@/hooks/use-paged-sessions';
import { useQuery } from '@/hooks/use-query';
import { fetchMyWeekSessions, fetchUserSessionsPage } from '@/lib/api/sessions';
import { archiveGoal, fetchGoals, fetchSubjects, setMilestoneCompleted } from '@/lib/api/subjects';
import { confirmAction } from '@/lib/confirm';
import { friendlyError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import { computeWeekStats, weeklyGoalProgress } from '@/lib/stats';
import { formatDuration, parseTimestamp } from '@/lib/time';
import type { Goal, SessionCardData } from '@/lib/types';
import { formatWeekLabel, isWithinRange, localWeekRange, WEEK_DEFINITION_TEXT } from '@/lib/week';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';
import { makeStyles, useTheme } from '@/providers/theme';

export default function ProgressScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userId } = useMe();
  const toast = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  // Recomputed per render so the "current" week rolls over at local midnight Monday.
  const week = localWeekRange(new Date(), weekOffset);
  const weekKey = week.start.getTime();

  const weekData = useQuery(
    async () => {
      const [sessions, goals, subjects] = await Promise.all([
        fetchMyWeekSessions(userId, week),
        fetchGoals(userId),
        fetchSubjects(userId),
      ]);
      return { sessions, goals, subjects };
    },
    [userId, weekKey],
    { topics: ['sessions', 'goals', 'subjects'] },
  );
  const history = usePagedSessions((cursor) => fetchUserSessionsPage(userId, userId, cursor, { includePrivate: true }), [userId]);
  const toggleLike = useLikeToggle(history.updateItem);

  const stats = useMemo(
    () => (weekData.data ? computeWeekStats(weekData.data.sessions, week) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekData.data, weekKey],
  );
  const wins = (weekData.data?.sessions ?? [])
    .filter((s) => s.accomplishment?.trim() && isWithinRange(parseTimestamp(s.started_at), week))
    .reverse();
  const subjectName = (id: string | null) => weekData.data?.subjects.find((s) => s.id === id)?.name;

  const refreshAll = () => {
    weekData.refresh();
    history.refresh();
  };

  const toggleMilestone = async (goal: Goal) => {
    try {
      await setMilestoneCompleted(goal.id, !goal.completed_at);
      invalidate('goals');
      weekData.refresh();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const removeGoal = async (goal: Goal) => {
    const ok = await confirmAction({
      title: `Archive “${goal.title}”?`,
      message: 'It will disappear from your active goals. Sessions linked to it are kept.',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    try {
      await archiveGoal(goal.id);
      invalidate('goals');
      weekData.refresh();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const header = (
    <View style={[styles.column, styles.headerStack]}>
      <AppText variant="title" accessibilityRole="header">
        Progress
      </AppText>
      <ActiveSessionBanner />

      <View style={styles.weekNav}>
        <IconButton icon="chevronLeft" label="Previous week" onPress={() => setWeekOffset((w) => w - 1)} />
        <AppText variant="heading" accessibilityLiveRegion="polite">
          {formatWeekLabel(week)}
        </AppText>
        <IconButton icon="chevronRight" label="Next week" onPress={() => setWeekOffset((w) => Math.min(0, w + 1))} disabled={weekOffset >= 0} />
      </View>
      <AppText variant="caption" color={colors.textSecondary} style={styles.center}>
        {WEEK_DEFINITION_TEXT}
      </AppText>

      {weekData.loading ? (
        <LoadingState />
      ) : weekData.error && !weekData.data ? (
        <ErrorState message={weekData.error} onRetry={weekData.reload} />
      ) : stats && weekData.data ? (
        <>
          {weekData.error ? <Banner tone="danger" message={weekData.error} actionLabel="Retry" onAction={weekData.refresh} /> : null}
          <View style={styles.tiles}>
            <StatTile label="Studied" value={formatDuration(stats.totalSeconds)} />
            <StatTile label="Sessions" value={String(stats.sessionCount)} />
            <StatTile label="Wins logged" value={String(stats.accomplishmentCount)} highlight />
          </View>

          <Card>
            <AppText variant="heading">Daily study time</AppText>
            <WeekChart
              dailySeconds={stats.dailySeconds}
              dailySegments={stats.dailySegments}
              subjects={stats.bySubject}
              weekStart={week.start}
            />
            <AppText variant="caption" color={colors.textSecondary}>
              Time is one signal. What you actually got done matters more — log it after each session.
            </AppText>
          </Card>

          <Card>
            <AppText variant="heading">Wins this week</AppText>
            {wins.length === 0 ? (
              <AppText variant="small" color={colors.textSecondary}>
                When you finish a session, write what you accomplished. Your wins collect here.
              </AppText>
            ) : (
              wins.slice(0, 8).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
                  accessibilityRole="button"
                  style={styles.win}>
                  <SubjectDot color={s.subject_color} />
                  <View style={styles.flex}>
                    <AppText variant="body" numberOfLines={2}>
                      {s.accomplishment}
                    </AppText>
                    <AppText variant="caption" color={colors.textSecondary}>
                      {s.subject_name} · {formatDuration(s.duration_seconds)}
                    </AppText>
                  </View>
                </Pressable>
              ))
            )}
          </Card>

          <Card>
            <AppText variant="heading">By subject</AppText>
            {stats.bySubject.length === 0 ? (
              <AppText variant="small" color={colors.textSecondary}>
                No sessions this week yet.
              </AppText>
            ) : (
              stats.bySubject.map((s) => (
                <View key={s.subjectId} style={styles.subjectRow}>
                  <View style={styles.subjectLabel}>
                    <SubjectDot color={s.color} />
                    <AppText variant="smallStrong" numberOfLines={1} style={styles.flex}>
                      {s.name}
                    </AppText>
                    <AppText variant="small" color={colors.textSecondary}>
                      {formatDuration(s.seconds)} · {s.sessions} {s.sessions === 1 ? 'session' : 'sessions'}
                    </AppText>
                  </View>
                  <ProgressBar ratio={stats.totalSeconds ? s.seconds / stats.totalSeconds : 0} color={s.color} />
                </View>
              ))
            )}
          </Card>

          <SectionHeader
            title="Goals"
            action={<Button title="New goal" icon="plus" size="sm" variant="secondary" onPress={() => router.push('/goals/new')} />}
          />
          {weekData.data.goals.length === 0 ? (
            <Card>
              <AppText variant="small" color={colors.textSecondary}>
                Set a weekly time goal (e.g. 6 hours of Calculus) or a milestone (e.g. “Finish CS 31 practice exam”).
              </AppText>
            </Card>
          ) : (
            weekData.data.goals.map((goal) =>
              goal.kind === 'weekly_time' ? (
                <WeeklyGoalCard
                  key={goal.id}
                  goal={goal}
                  subject={subjectName(goal.subject_id)}
                  progress={weeklyGoalProgress(goal, weekData.data!.sessions, week)}
                  onArchive={() => removeGoal(goal)}
                />
              ) : (
                <MilestoneCard
                  key={goal.id}
                  goal={goal}
                  subject={subjectName(goal.subject_id)}
                  onToggle={() => toggleMilestone(goal)}
                  onArchive={() => removeGoal(goal)}
                />
              ),
            )
          )}
        </>
      ) : null}

      <SectionHeader title="History" />
      <AppText variant="caption" color={colors.textSecondary}>
        All your sessions, including private ones (🔒 only you can see those).
      </AppText>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={history.items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={weekData.refreshing || history.refreshing} onRefresh={refreshAll} tintColor={colors.accent} />}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        renderItem={({ item }: { item: SessionCardData }) => (
          <View style={styles.column}>
            <SessionCard session={item} showAuthor={false} onToggleLike={toggleLike} />
          </View>
        )}
        onEndReached={history.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          history.loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : history.error ? (
            <View style={styles.column}>
              <Banner tone="danger" message={history.error} actionLabel="Retry" onAction={history.retry} />
            </View>
          ) : (
            <View style={styles.column}>
              <Card>
                <AppText variant="body">No sessions yet.</AppText>
                <Button title="Start your first session" icon="play" onPress={() => router.navigate('/study')} />
              </Card>
            </View>
          )
        }
        ListFooterComponent={
          history.loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.accent} />
          ) : history.loadMoreError ? (
            <View style={[styles.column, styles.footer]}>
              <Banner tone="danger" message={history.loadMoreError} actionLabel="Retry" onAction={history.loadMore} />
            </View>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

function StatTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.tile, highlight && { backgroundColor: colors.accentSoft }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="title" color={highlight ? colors.accentStrong : colors.text} style={styles.tileValue} maxFontSizeMultiplier={1.4}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

function WeeklyGoalCard({
  goal,
  subject,
  progress,
  onArchive,
}: {
  goal: Goal;
  subject?: string;
  progress: ReturnType<typeof weeklyGoalProgress>;
  onArchive: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Card>
      <View style={styles.goalHeader}>
        <Icon name="target" size={20} color={colors.accent} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{goal.title}</AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            {formatDuration((goal.weekly_target_minutes ?? 0) * 60)} per week · {subject ?? 'All subjects'}
          </AppText>
        </View>
        <IconButton icon="archive" label={`Archive goal ${goal.title}`} size={18} color={colors.textSecondary} onPress={onArchive} />
      </View>
      <ProgressBar ratio={progress.ratio} />
      <AppText variant="small" color={progress.met ? colors.accentStrong : colors.textSecondary}>
        {progress.met
          ? `Goal met 🎉 ${formatDuration(progress.doneSeconds)} this week`
          : `${formatDuration(progress.doneSeconds)} of ${formatDuration(progress.targetSeconds)} · ${formatDuration(progress.remainingSeconds)} to go`}
      </AppText>
    </Card>
  );
}

function MilestoneCard({
  goal,
  subject,
  onToggle,
  onArchive,
}: {
  goal: Goal;
  subject?: string;
  onToggle: () => void;
  onArchive: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const done = !!goal.completed_at;
  const due = goal.target_date ? new Date(`${goal.target_date}T00:00:00`) : null;
  return (
    <Card>
      <View style={styles.goalHeader}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `Mark ${goal.title} as not done` : `Mark ${goal.title} as done`}
          hitSlop={10}>
          <Icon name={done ? 'checkCircle' : 'circle'} size={26} color={done ? colors.accent : colors.textSecondary} />
        </Pressable>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" style={done && styles.doneText}>
            {goal.title}
          </AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            Milestone · {subject ?? 'Any subject'}
            {due ? ` · due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
            {done ? ' · completed' : ''}
          </AppText>
        </View>
        <IconButton icon="archive" label={`Archive goal ${goal.title}`} size={18} color={colors.textSecondary} onPress={onArchive} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  list: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  headerStack: { gap: Spacing.lg, marginBottom: Spacing.md },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { textAlign: 'center', marginTop: -Spacing.sm },
  tileValue: { fontSize: 22, lineHeight: 30 },
  tiles: { flexDirection: 'row', gap: Spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  win: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', paddingVertical: Spacing.xs, minHeight: 44 },
  subjectRow: { gap: Spacing.xs },
  subjectLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  doneText: { textDecorationLine: 'line-through', color: c.textSecondary },
  flex: { flex: 1 },
  footer: { marginTop: Spacing.lg },
}));
