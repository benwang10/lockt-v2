import { formatStatusExpiry, isStatusActive, statusLength, STATUS_MAX_CHARS, validateStatus } from '../status';

describe('profile status rules (mirror the database)', () => {
  test('length counts code points like Postgres, so an emoji counts once', () => {
    expect(statusLength('📚 study')).toBe(7);
    expect(statusLength('👩🏽‍💻')).toBe(4); // ZWJ sequence: 4 code points, same as char_length()
    expect('📚'.length).toBe(2); // UTF-16 length would over-count
  });

  test('100 characters max, emoji or note required', () => {
    expect(validateStatus({ emoji: null, body: 'x'.repeat(STATUS_MAX_CHARS) })).toBeNull();
    expect(validateStatus({ emoji: null, body: 'x'.repeat(STATUS_MAX_CHARS + 1) })).toMatch(/100/);
    expect(validateStatus({ emoji: null, body: '   ' })).toMatch(/note or add an emoji/);
    expect(validateStatus({ emoji: '☕', body: '' })).toBeNull();
  });

  test('expired statuses are inactive; expiry text counts down', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect(isStatusActive({ expires_at: '2026-11-05T12:00:00Z' }, now)).toBe(true);
    expect(isStatusActive({ expires_at: '2026-11-04T12:00:00Z' }, now)).toBe(false);
    expect(formatStatusExpiry('2026-11-05T12:00:00.000000+00:00', now)).toBe('Expires in 24h');
    expect(formatStatusExpiry('2026-11-04T12:30:00Z', now)).toBe('Expires in 30m');
    expect(formatStatusExpiry('2026-11-04T11:00:00Z', now)).toBe('Expired');
  });
});
