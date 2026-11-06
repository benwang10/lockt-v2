/**
 * Postgres returns timestamps with microsecond precision
 * ("2026-11-02T21:46:12.123456+00:00"). Not every JS engine parses more than
 * three fractional digits, so normalise before parsing.
 */
export function parseTimestamp(value: string): number {
  const normalised = value
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(normalised);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return ms;
}

/** "1h 05m", "25m", "45s" — compact duration for cards and stats. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

/** "1h40", "45m", "30s" — for tight chart labels (full text goes in accessibility labels). */
export function formatDurationCompact(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

/** "1:02:03" / "02:03" — stopwatch display. */
export function formatClock(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Hours with one decimal, e.g. 5400s -> "1.5". */
export function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  return hours >= 10 ? hours.toFixed(0) : hours.toFixed(1);
}

/** "just now", "5m", "3h", "2d", or a short date for older items. */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = parseTimestamp(iso);
  const diff = Math.max(0, nowMs - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
