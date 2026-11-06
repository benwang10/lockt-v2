import { formatHighlight, formatHoursValue, HIGHLIGHT_OPTIONS } from '../highlight';

describe('profile highlight formatting', () => {
  test('hours never show excessive decimals', () => {
    expect(formatHoursValue(0)).toBe('0');
    expect(formatHoursValue(1500)).toBe('0.4');
    expect(formatHoursValue(3600)).toBe('1');
    expect(formatHoursValue(16_200)).toBe('4.5');
    expect(formatHoursValue(35_999)).toBe('10');
    expect(formatHoursValue(468_000)).toBe('130');
  });

  test('labels carry clear units', () => {
    expect(formatHighlight({ kind: 'hours_week', value: 16_200, scope: 'all' })).toEqual({ value: '4.5', label: 'hours this week' });
    expect(formatHighlight({ kind: 'hours_week', value: 3600, scope: 'all' })).toEqual({ value: '1', label: 'hour this week' });
    expect(formatHighlight({ kind: 'hours_lifetime', value: 7_200_000, scope: 'shared' })).toEqual({ value: '2000', label: 'hours studied' });
    expect(formatHighlight({ kind: 'sessions_week', value: 1, scope: 'all' })).toEqual({ value: '1', label: 'session this week' });
    expect(formatHighlight({ kind: 'wins_week', value: 3, scope: 'all' })).toEqual({ value: '3', label: 'wins this week' });
  });

  test('every option is explained, and wins explain they are owner-only', () => {
    expect(HIGHLIGHT_OPTIONS.map((o) => o.value)).toEqual(['hours_week', 'sessions_week', 'wins_week', 'hours_lifetime', 'hidden']);
    expect(HIGHLIGHT_OPTIONS.find((o) => o.value === 'wins_week')!.description).toMatch(/only you/);
  });
});
