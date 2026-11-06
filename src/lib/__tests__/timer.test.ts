import { activeElapsedMs, computeClockOffsetMs, serverNowFromDevice } from '../timer';
import { formatClock, formatDuration, parseTimestamp } from '../time';

const T0 = Date.parse('2026-11-02T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('activeElapsedMs', () => {
  test('running session adds the current segment to banked time', () => {
    const timer = { timer_state: 'running' as const, running_since: iso(T0), accumulated_ms: 60_000 };
    expect(activeElapsedMs(timer, T0 + 30_000)).toBe(90_000);
  });

  test('paused session is frozen regardless of how much time passes', () => {
    const timer = { timer_state: 'paused' as const, running_since: null, accumulated_ms: 1_234_000 };
    expect(activeElapsedMs(timer, T0)).toBe(1_234_000);
    expect(activeElapsedMs(timer, T0 + 10 * 3_600_000)).toBe(1_234_000);
  });

  test('pause → resume → background → restart: elapsed derives purely from timestamps', () => {
    // 10 min running, paused for 20 min, resumed. App killed, reopened 15 min later.
    const resumedAt = T0 + 30 * 60_000;
    const persisted = { timer_state: 'running' as const, running_since: iso(resumedAt), accumulated_ms: 10 * 60_000 };
    const reopenedAt = resumedAt + 15 * 60_000;
    // No interval ran while the app was dead — the value is still exact.
    expect(activeElapsedMs(persisted, reopenedAt)).toBe(25 * 60_000);
  });

  test('device clock behind the server does not produce negative or wrong time', () => {
    const timer = { timer_state: 'running' as const, running_since: iso(T0), accumulated_ms: 0 };
    const offset = 90_000; // server is 90 s ahead of the device
    const deviceNow = T0 - 30_000; // device thinks it is before the segment started
    expect(activeElapsedMs(timer, serverNowFromDevice(deviceNow, offset))).toBe(60_000);
    expect(activeElapsedMs(timer, T0 - 5_000)).toBe(0);
  });

  test('accumulated_ms may arrive as a bigint string', () => {
    const timer = { timer_state: 'paused' as const, running_since: null, accumulated_ms: '4200' };
    expect(activeElapsedMs(timer, T0)).toBe(4200);
  });
});

describe('computeClockOffsetMs', () => {
  test('uses the round-trip midpoint', () => {
    const offset = computeClockOffsetMs(iso(T0 + 5_000), T0 - 200, T0 + 200);
    expect(offset).toBe(5_000);
  });
});

describe('time helpers', () => {
  test('parses Postgres microsecond timestamps', () => {
    expect(parseTimestamp('2026-11-02T10:00:00.123456+00:00')).toBe(T0 + 123);
    expect(parseTimestamp('2026-11-02 10:00:00.5+00')).toBe(T0 + 500);
  });

  test('formats durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(25 * 60)).toBe('25m');
    expect(formatDuration(3600 + 5 * 60)).toBe('1h 05m');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(59_999)).toBe('00:59');
  });
});
