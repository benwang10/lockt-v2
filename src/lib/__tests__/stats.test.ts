import { computeWeekStats, weeklyGoalProgress, type StatSession } from '../stats';
import { formatDurationCompact } from '../time';
import { localWeekRange } from '../week';

const week = localWeekRange(new Date(2026, 10, 4, 12)); // week of Mon 2 Nov 2026 (local)

function session(id: string, start: Date, minutes: number, subject = 'math', accomplishment: string | null = null): StatSession {
  return {
    id,
    subject_id: subject,
    subject_name: subject.toUpperCase(),
    subject_color: '#123456',
    started_at: start.toISOString(),
    duration_seconds: minutes * 60,
    accomplishment,
  };
}

describe('computeWeekStats', () => {
  const sessions = [
    session('a', new Date(2026, 10, 2, 9), 60, 'math', 'Did problem set'),
    session('b', new Date(2026, 10, 2, 20), 30, 'cs'),
    session('c', new Date(2026, 10, 8, 23, 50), 45, 'cs', '  '), // Sunday late, still this week
    session('d', new Date(2026, 10, 9, 0, 0), 90, 'cs'), // next Monday 00:00 — excluded
    session('e', new Date(2026, 10, 1, 23, 59), 90, 'cs'), // previous Sunday — excluded
  ];

  test('totals only sessions that started inside the local week', () => {
    const stats = computeWeekStats(sessions, week);
    expect(stats.sessionCount).toBe(3);
    expect(stats.totalSeconds).toBe((60 + 30 + 45) * 60);
  });

  test('daily buckets are Monday-first local days', () => {
    const stats = computeWeekStats(sessions, week);
    expect(stats.dailySeconds).toEqual([90 * 60, 0, 0, 0, 0, 0, 45 * 60]);
  });

  test('subject breakdown is sorted by time', () => {
    const stats = computeWeekStats(sessions, week);
    expect(stats.bySubject.map((s) => [s.subjectId, s.seconds, s.sessions])).toEqual([
      ['cs', 75 * 60, 2],
      ['math', 60 * 60, 1],
    ]);
  });

  test('counts accomplishments (ignores blank text)', () => {
    expect(computeWeekStats(sessions, week).accomplishmentCount).toBe(1);
  });

  test('never double counts a session that appears twice (e.g. paging overlap)', () => {
    const stats = computeWeekStats([sessions[0], sessions[0]], week);
    expect(stats.sessionCount).toBe(1);
  });
});

describe('weeklyGoalProgress', () => {
  const sessions = [
    session('a', new Date(2026, 10, 3, 9), 120, 'math'),
    session('b', new Date(2026, 10, 4, 9), 60, 'cs'),
    session('old', new Date(2026, 9, 28, 9), 600, 'math'), // previous week
  ];

  test('unscoped goal counts every subject in the week', () => {
    const p = weeklyGoalProgress({ weekly_target_minutes: 240, subject_id: null }, sessions, week);
    expect(p.doneSeconds).toBe(180 * 60);
    expect(p.ratio).toBeCloseTo(0.75);
    expect(p.remainingSeconds).toBe(60 * 60);
    expect(p.met).toBe(false);
  });

  test('subject-scoped goal counts only that subject', () => {
    const p = weeklyGoalProgress({ weekly_target_minutes: 60, subject_id: 'math' }, sessions, week);
    expect(p.doneSeconds).toBe(120 * 60);
    expect(p.ratio).toBe(1);
    expect(p.met).toBe(true);
    expect(p.remainingSeconds).toBe(0);
  });

  test('progress resets each calendar week', () => {
    const nextWeek = localWeekRange(new Date(2026, 10, 11));
    const p = weeklyGoalProgress({ weekly_target_minutes: 60, subject_id: null }, sessions, nextWeek);
    expect(p.doneSeconds).toBe(0);
  });
});

describe('daily subject segments (stacked chart)', () => {
  function withColor(s: StatSession, color: string): StatSession {
    return { ...s, subject_color: color };
  }

  test('segments of each day sum exactly to that day’s total', () => {
    const sessions = [
      session('a', new Date(2026, 10, 2, 9), 60, 'math'),
      session('b', new Date(2026, 10, 2, 20), 30, 'cs'),
      session('c', new Date(2026, 10, 2, 21), 17, 'math'),
      session('d', new Date(2026, 10, 4, 8), 45, 'bio'),
      session('e', new Date(2026, 10, 8, 23, 50), 45, 'cs'),
    ];
    const stats = computeWeekStats(sessions, week);
    stats.dailySegments.forEach((segments, day) => {
      expect(segments.reduce((sum, s) => sum + s.seconds, 0)).toBe(stats.dailySeconds[day]);
    });
    expect(stats.dailySegments[0].map((s) => [s.subjectId, s.seconds])).toEqual([
      ['math', 77 * 60],
      ['cs', 30 * 60],
    ]);
    // Zero-study days are kept (empty), not dropped.
    expect(stats.dailySegments).toHaveLength(7);
    expect(stats.dailySegments[1]).toEqual([]);
  });

  test('stacking order follows the weekly subject ranking on every day', () => {
    const sessions = [
      session('a', new Date(2026, 10, 2, 9), 10, 'math'),
      session('b', new Date(2026, 10, 2, 10), 20, 'cs'),
      session('c', new Date(2026, 10, 3, 9), 100, 'math'),
      session('d', new Date(2026, 10, 3, 10), 5, 'cs'),
    ];
    const stats = computeWeekStats(sessions, week);
    expect(stats.bySubject.map((s) => s.subjectId)).toEqual(['math', 'cs']);
    expect(stats.dailySegments[0].map((s) => s.subjectId)).toEqual(['math', 'cs']);
    expect(stats.dailySegments[1].map((s) => s.subjectId)).toEqual(['math', 'cs']);
  });

  test('segments keep the subject colour snapshot', () => {
    const stats = computeWeekStats([withColor(session('a', new Date(2026, 10, 3, 9), 30, 'art'), '#C2378A')], week);
    expect(stats.dailySegments[1]).toEqual([{ subjectId: 'art', name: 'ART', color: '#C2378A', seconds: 1800 }]);
  });

  test('a session belongs to the local day it started, even when it runs past midnight', () => {
    const stats = computeWeekStats([session('late', new Date(2026, 10, 3, 23, 30), 120, 'cs')], week);
    expect(stats.dailySegments[1].map((s) => s.seconds)).toEqual([7200]);
    expect(stats.dailySegments[2]).toEqual([]);
  });

  test('DST week (169 h in Los Angeles): Sunday after the change still lands on Sunday', () => {
    const dstWeek = localWeekRange(new Date(2026, 9, 28, 12)); // Mon 26 Oct – Mon 2 Nov
    expect((dstWeek.end.getTime() - dstWeek.start.getTime()) / 3_600_000).toBe(169);
    const sessions = [
      session('before', new Date(2026, 10, 1, 0, 30), 30, 'math'), // Sun 1 Nov, before 2am change
      session('after', new Date(2026, 10, 1, 23, 30), 25, 'cs'), // Sun 1 Nov, late
      session('next', new Date(2026, 10, 2, 0, 0), 60, 'cs'), // next Monday 00:00 — excluded
    ];
    const stats = computeWeekStats(sessions, dstWeek);
    expect(stats.dailySeconds[6]).toBe(55 * 60);
    expect(stats.dailySegments[6].reduce((sum, s) => sum + s.seconds, 0)).toBe(55 * 60);
    expect(stats.dailySegments.slice(0, 6).every((d) => d.length === 0)).toBe(true);
  });
});

test('compact chart labels', () => {
  expect(formatDurationCompact(6000)).toBe('1h40');
  expect(formatDurationCompact(7200)).toBe('2h');
  expect(formatDurationCompact(2700)).toBe('45m');
  expect(formatDurationCompact(30)).toBe('30s');
});
