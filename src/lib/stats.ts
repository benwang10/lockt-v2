import { parseTimestamp } from './time';
import { isWithinRange, localDayIndexInWeek, type WeekRange } from './week';

/** The subset of a completed session needed for progress statistics. */
export type StatSession = {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  started_at: string;
  duration_seconds: number;
  accomplishment?: string | null;
};

export type SubjectTotal = {
  subjectId: string;
  name: string;
  color: string;
  seconds: number;
  sessions: number;
};

/** One subject's share of one day's bar. */
export type DaySegment = {
  subjectId: string;
  name: string;
  color: string;
  seconds: number;
};

export type WeekStats = {
  totalSeconds: number;
  sessionCount: number;
  /** Seconds per local day, Monday first. */
  dailySeconds: number[];
  /**
   * Per local day (Monday first), the time per subject. Segments of a day sum
   * exactly to `dailySeconds[day]`; they are ordered by each subject's weekly
   * total (largest first), so stacking order is the same on every day.
   */
  dailySegments: DaySegment[][];
  bySubject: SubjectTotal[];
  /** Sessions this week where the user wrote down what they accomplished. */
  accomplishmentCount: number;
};

/**
 * Weekly statistics for completed sessions. Private and shared sessions count
 * equally; discarded sessions never exist as completed rows, and paused time is
 * already excluded from duration_seconds by the server.
 */
export function computeWeekStats(sessions: StatSession[], week: WeekRange): WeekStats {
  const dailySeconds = [0, 0, 0, 0, 0, 0, 0];
  const dailyBySubject: Map<string, number>[] = dailySeconds.map(() => new Map());
  const subjects = new Map<string, SubjectTotal>();
  let totalSeconds = 0;
  let sessionCount = 0;
  let accomplishmentCount = 0;
  const seen = new Set<string>();

  for (const s of sessions) {
    if (seen.has(s.id)) continue; // defensive: never double count a session
    seen.add(s.id);
    const startedMs = parseTimestamp(s.started_at);
    if (!isWithinRange(startedMs, week)) continue;
    const seconds = Math.max(0, s.duration_seconds || 0);

    totalSeconds += seconds;
    sessionCount += 1;
    if (s.accomplishment && s.accomplishment.trim().length > 0) accomplishmentCount += 1;

    const day = localDayIndexInWeek(startedMs, week.start);
    if (day >= 0) {
      dailySeconds[day] += seconds;
      const perSubject = dailyBySubject[day];
      perSubject.set(s.subject_id, (perSubject.get(s.subject_id) ?? 0) + seconds);
    }

    const existing = subjects.get(s.subject_id);
    if (existing) {
      existing.seconds += seconds;
      existing.sessions += 1;
    } else {
      subjects.set(s.subject_id, {
        subjectId: s.subject_id,
        name: s.subject_name,
        color: s.subject_color,
        seconds,
        sessions: 1,
      });
    }
  }

  const bySubject = [...subjects.values()].sort((a, b) => b.seconds - a.seconds);
  const order = new Map(bySubject.map((s, i) => [s.subjectId, i]));
  const dailySegments = dailyBySubject.map((perSubject) =>
    [...perSubject.entries()]
      .filter(([, seconds]) => seconds > 0)
      .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map(([subjectId, seconds]) => {
        const subject = subjects.get(subjectId)!;
        return { subjectId, name: subject.name, color: subject.color, seconds };
      }),
  );
  return { totalSeconds, sessionCount, dailySeconds, dailySegments, bySubject, accomplishmentCount };
}

export type WeeklyGoalLike = {
  weekly_target_minutes: number | null;
  subject_id: string | null;
};

export type GoalProgress = {
  targetSeconds: number;
  doneSeconds: number;
  /** 0..1, capped. */
  ratio: number;
  remainingSeconds: number;
  met: boolean;
};

/**
 * Progress toward a weekly time goal: every completed session that started in
 * the week (and matches the goal's subject, if scoped) counts, whether it was
 * shared or private, and whether or not it was explicitly linked to the goal.
 */
export function weeklyGoalProgress(
  goal: WeeklyGoalLike,
  sessions: StatSession[],
  week: WeekRange,
): GoalProgress {
  const targetSeconds = Math.max(0, (goal.weekly_target_minutes ?? 0) * 60);
  const scoped = goal.subject_id ? sessions.filter((s) => s.subject_id === goal.subject_id) : sessions;
  const { totalSeconds } = computeWeekStats(scoped, week);
  const ratio = targetSeconds === 0 ? 0 : Math.min(1, totalSeconds / targetSeconds);
  return {
    targetSeconds,
    doneSeconds: totalSeconds,
    ratio,
    remainingSeconds: Math.max(0, targetSeconds - totalSeconds),
    met: targetSeconds > 0 && totalSeconds >= targetSeconds,
  };
}
