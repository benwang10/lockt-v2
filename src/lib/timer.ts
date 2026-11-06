import { parseTimestamp } from './time';

/**
 * The persisted timer state of an active session. Elapsed time is always
 * derived from these fields — never from a JS interval — so it survives
 * backgrounding, navigation and app restarts.
 */
export type TimerFields = {
  timer_state: 'running' | 'paused' | null;
  running_since: string | null;
  accumulated_ms: number | string;
};

/**
 * Active (non-paused) time in ms at the given server time.
 *   accumulated_ms covers all completed running segments;
 *   the current segment (if running) adds serverNow - running_since.
 */
export function activeElapsedMs(timer: TimerFields, serverNowMs: number): number {
  const banked = Number(timer.accumulated_ms) || 0;
  if (timer.timer_state !== 'running' || !timer.running_since) return banked;
  const segment = serverNowMs - parseTimestamp(timer.running_since);
  return banked + Math.max(0, segment);
}

/**
 * Estimate (server clock - device clock) from a server timestamp captured
 * during a request. Assumes the server stamped the request half-way through
 * the round trip; error is bounded by half the latency.
 */
export function computeClockOffsetMs(
  serverNowIso: string,
  requestStartedAtMs: number,
  responseReceivedAtMs: number,
): number {
  const midpoint = (requestStartedAtMs + responseReceivedAtMs) / 2;
  return parseTimestamp(serverNowIso) - midpoint;
}

/** Device time translated onto the server clock. */
export function serverNowFromDevice(deviceNowMs: number, offsetMs: number): number {
  return deviceNowMs + offsetMs;
}

/** Sessions longer than this trigger a "did you forget to stop?" prompt. */
export const LONG_SESSION_WARNING_MS = 8 * 60 * 60 * 1000;
/** Server-side cap on recorded active time (see finish_session). */
export const MAX_SESSION_SECONDS = 24 * 60 * 60;
