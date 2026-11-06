import {
  addLocalDays,
  isWithinRange,
  localDayIndexInWeek,
  localWeekRange,
  startOfLocalWeek,
} from '../week';

// jest runs these in America/Los_Angeles (see jest.config.js / package.json).

describe('calendar week (Monday 00:00 local → next Monday 00:00)', () => {
  test('time zone under test has DST', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Los_Angeles');
  });

  test('a Wednesday maps to the preceding Monday at local midnight', () => {
    const wed = new Date(2026, 9, 14, 15, 30); // Wed 14 Oct 2026
    const start = startOfLocalWeek(wed);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(12);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  test('Sunday 23:59 belongs to the week that started the previous Monday', () => {
    const sundayLate = new Date(2026, 9, 18, 23, 59, 59);
    expect(startOfLocalWeek(sundayLate).getDate()).toBe(12);
  });

  test('Monday 00:00 starts a new week', () => {
    const mondayMidnight = new Date(2026, 9, 19, 0, 0, 0);
    expect(startOfLocalWeek(mondayMidnight).getTime()).toBe(mondayMidnight.getTime());
    const justBefore = new Date(mondayMidnight.getTime() - 1);
    expect(startOfLocalWeek(justBefore).getDate()).toBe(12);
  });

  test('week containing the end of DST (Nov 1 2026) is 169 hours long', () => {
    const range = localWeekRange(new Date(2026, 10, 1, 12)); // Sun 1 Nov 2026
    expect(range.start.getDate()).toBe(26); // Mon 26 Oct
    expect((range.end.getTime() - range.start.getTime()) / 3_600_000).toBe(169);
    expect(range.end.getHours()).toBe(0);
  });

  test('week containing the start of DST (Mar 8 2026) is 167 hours long', () => {
    const range = localWeekRange(new Date(2026, 2, 8, 12)); // Sun 8 Mar 2026
    expect((range.end.getTime() - range.start.getTime()) / 3_600_000).toBe(167);
  });

  test('week ranges are contiguous and non-overlapping across offsets', () => {
    const now = new Date(2026, 10, 2, 9);
    const prev = localWeekRange(now, -1);
    const cur = localWeekRange(now, 0);
    expect(prev.end.getTime()).toBe(cur.start.getTime());
    expect(isWithinRange(cur.start.getTime(), cur)).toBe(true);
    expect(isWithinRange(cur.start.getTime(), prev)).toBe(false);
  });

  test('weeks spanning a month / year boundary', () => {
    const range = localWeekRange(new Date(2027, 0, 1, 10)); // Fri 1 Jan 2027
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(11);
    expect(range.start.getDate()).toBe(28);
  });

  test('day index uses local days even across a DST change', () => {
    const range = localWeekRange(new Date(2026, 10, 1, 12));
    // Sunday 1 Nov 23:30 local is day 6, Monday 26 Oct 00:00 is day 0.
    expect(localDayIndexInWeek(new Date(2026, 10, 1, 23, 30).getTime(), range.start)).toBe(6);
    expect(localDayIndexInWeek(range.start.getTime(), range.start)).toBe(0);
    expect(localDayIndexInWeek(range.end.getTime(), range.start)).toBe(-1);
  });

  test('addLocalDays always lands on local midnight', () => {
    const d = addLocalDays(new Date(2026, 10, 1, 1, 30), 1);
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(2);
  });
});
