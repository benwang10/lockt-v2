import { isSupportedEmoji } from './emoji';
import { parseTimestamp } from './time';

/** Must match the database constraint (char_length counts code points). */
export const STATUS_MAX_CHARS = 100;
export const STATUS_LIFETIME_HOURS = 24;

/** Quick suggestions in the note editor; any emoji typed with the keyboard also works. */
export const STATUS_EMOJI = ['📚', '☕', '🎧', '🧠', '✍️', '🔬', '💻', '🌿', '😴', '🎉', '🔥', '🙏'] as const;

/** Characters as the database counts them (code points, so an emoji counts once). */
export function statusLength(text: string): number {
  return Array.from(text).length;
}

export function validateStatus(input: { emoji: string | null; body: string }): string | null {
  const body = input.body.trim();
  if (!body && !input.emoji) return 'Write a short note or add an emoji.';
  if (input.emoji && !isSupportedEmoji(input.emoji)) return 'Use a single emoji (letters and numbers can’t be used there).';
  if (statusLength(body) > STATUS_MAX_CHARS) return `Keep it to ${STATUS_MAX_CHARS} characters.`;
  return null;
}

export function isStatusActive(status: { expires_at: string }, nowMs: number = Date.now()): boolean {
  return parseTimestamp(status.expires_at) > nowMs;
}

/** "Expires in 23h" / "Expires in 12m" / "Expired". */
export function formatStatusExpiry(expiresAt: string, nowMs: number = Date.now()): string {
  const left = parseTimestamp(expiresAt) - nowMs;
  if (left <= 0) return 'Expired';
  const minutes = Math.ceil(left / 60_000);
  if (minutes < 60) return `Expires in ${minutes}m`;
  return `Expires in ${Math.floor(minutes / 60)}h`;
}
