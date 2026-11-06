/**
 * Calendar-week definition used everywhere in the app:
 *
 *   A week runs from Monday 00:00 to the following Monday 00:00 in the
 *   device's current local time zone. A session belongs to the day (and week)
 *   on which it *started*.
 *
 * All boundaries are built from local calendar fields (new Date(y, m, d)), so
 * weeks containing a daylight-saving change are correctly 167 or 169 hours.
 */

export const WEEK_DEFINITION_TEXT =
  'Weeks run Monday 00:00 to Sunday 23:59 in your current time zone. Sessions count on the day they started.';

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
}

/** Monday 00:00 local time of the week containing `date`. */
export function startOfLocalWeek(date: Date): Date {
  const daysSinceMonday = (date.getDay() + 6) % 7; // getDay: 0 = Sunday
  return addLocalDays(date, -daysSinceMonday);
}

export type WeekRange = { start: Date; end: Date };

/** [start, end) for the week containing `date`, shifted by `offsetWeeks`. */
export function localWeekRange(date: Date, offsetWeeks = 0): WeekRange {
  const start = addLocalDays(startOfLocalWeek(date), offsetWeeks * 7);
  return { start, end: addLocalDays(start, 7) };
}

export function isWithinRange(instantMs: number, range: WeekRange): boolean {
  return instantMs >= range.start.getTime() && instantMs < range.end.getTime();
}

/** 0 (Monday) … 6 (Sunday) for an instant inside the week; -1 otherwise. */
export function localDayIndexInWeek(instantMs: number, weekStart: Date): number {
  for (let i = 0; i < 7; i++) {
    const dayStart = addLocalDays(weekStart, i).getTime();
    const dayEnd = addLocalDays(weekStart, i + 1).getTime();
    if (instantMs >= dayStart && instantMs < dayEnd) return i;
  }
  return -1;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function formatWeekLabel(range: WeekRange, now: Date = new Date()): string {
  const current = startOfLocalWeek(now).getTime();
  if (range.start.getTime() === current) return 'This week';
  if (range.start.getTime() === addLocalDays(new Date(current), -7).getTime()) return 'Last week';
  const last = addLocalDays(range.end, -1);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(range.start)} – ${fmt(last)}`;
}
