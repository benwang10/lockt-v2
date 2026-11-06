import type { HighlightStat, HighlightValue } from './types';

export const DEFAULT_HIGHLIGHT: HighlightStat = 'hours_week';

export const HIGHLIGHT_OPTIONS: { value: HighlightStat; label: string; description: string }[] = [
  {
    value: 'hours_week',
    label: 'Hours this week',
    description: 'Time studied since Monday 00:00 in your time zone.',
  },
  {
    value: 'sessions_week',
    label: 'Sessions this week',
    description: 'Completed study sessions since Monday.',
  },
  {
    value: 'wins_week',
    label: 'Wins this week',
    description:
      'Milestone goals you marked completed this week. Goals are private, so only you see this; followers see no highlight.',
  },
  {
    value: 'hours_lifetime',
    label: 'Lifetime hours',
    description: 'All the time you have recorded in Lockt.',
  },
  { value: 'hidden', label: 'Hidden', description: 'Show no statistic on your profile.' },
];

export const HIGHLIGHT_PRIVACY_NOTE =
  'On your own profile the number includes every session, including private ones. Followers see a number ' +
  'calculated only from the sessions you currently share with them. People who don’t follow you see nothing.';

/** Hours with at most one decimal: 0.4, 4.5, 12, 130 (never "4.50" or "12.0"). */
export function formatHoursValue(seconds: number): string {
  const hours = Math.max(0, seconds) / 3600;
  if (hours >= 10) return String(Math.round(hours));
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Display parts for the profile header, e.g. { value: '4.5', label: 'hours this week' }. */
export function formatHighlight(h: HighlightValue): { value: string; label: string } {
  switch (h.kind) {
    case 'hours_week': {
      const value = formatHoursValue(h.value);
      return { value, label: `${value === '1' ? 'hour' : 'hours'} this week` };
    }
    case 'hours_lifetime': {
      const value = formatHoursValue(h.value);
      return { value, label: `${value === '1' ? 'hour' : 'hours'} studied` };
    }
    case 'sessions_week':
      return { value: String(h.value), label: `${h.value === 1 ? 'session' : 'sessions'} this week` };
    case 'wins_week':
      return { value: String(h.value), label: `${h.value === 1 ? 'win' : 'wins'} this week` };
  }
}
