import { EMOJI_MAX_CODE_POINTS, isSupportedEmoji, readEmojiInput, segmentEmoji } from '@/lib/emoji';
import { validateStatus } from '@/lib/status';

const ONE_CLUSTER = [
  '📚', // basic
  '☕', // BMP pictograph
  '✍️', // with VS16
  '👍🏽', // skin tone
  '👩🏽‍💻', // ZWJ + skin tone
  '🧑‍🤝‍🧑', // multi-ZWJ
  '👨‍👩‍👧‍👦', // family (7 code points)
  '🏳️‍🌈', // VS16 + ZWJ
  '❤️‍🔥', // heart on fire
  '🇺🇸', // regional-indicator flag
  '🏴󠁧󠁢󠁳󠁣󠁴󠁿', // tag sequence (Scotland)
  '#️⃣', // keycap #
  '🧑🏻‍❤️‍💋‍🧑🏼', // long ZWJ sequence with two skin tones
];

describe('emoji segmentation', () => {
  test.each(ONE_CLUSTER)('%s is one supported emoji', (e) => {
    const segments = segmentEmoji(e);
    expect(segments).toEqual([{ text: e, emoji: true }]);
    expect(isSupportedEmoji(e)).toBe(true);
    expect(Array.from(e).length).toBeLessThanOrEqual(EMOJI_MAX_CODE_POINTS);
  });

  test('two flags side by side are two clusters', () => {
    expect(segmentEmoji('🇺🇸🇯🇵').map((s) => s.text)).toEqual(['🇺🇸', '🇯🇵']);
  });

  test('letters, digits and spaces are not emoji', () => {
    expect(isSupportedEmoji('a')).toBe(false);
    expect(isSupportedEmoji('1')).toBe(false);
    expect(isSupportedEmoji(' ')).toBe(false);
    expect(isSupportedEmoji('📚📚')).toBe(false);
    expect(isSupportedEmoji('')).toBe(false);
  });

  test('digit keycaps are rejected (the database refuses digits)', () => {
    expect(isSupportedEmoji('1️⃣')).toBe(false);
  });
});

describe('reading the emoji field', () => {
  test('empty input clears the emoji', () => {
    expect(readEmojiInput('')).toEqual({ emoji: null, hadOtherText: false, unsupported: false });
  });

  test('typing a new emoji next to the old one replaces it', () => {
    expect(readEmojiInput('📚☕').emoji).toBe('☕');
    expect(readEmojiInput('📚👩🏽‍💻').emoji).toBe('👩🏽‍💻');
  });

  test('pasted text keeps the emoji and flags the rest', () => {
    expect(readEmojiInput('hi 👋🏾')).toEqual({ emoji: '👋🏾', hadOtherText: true, unsupported: false });
    expect(readEmojiInput('hello')).toEqual({ emoji: null, hadOtherText: true, unsupported: false });
  });

  test('backspacing a skin tone or half a ZWJ sequence leaves a valid emoji', () => {
    expect(readEmojiInput('👍').emoji).toBe('👍'); // skin tone removed
    expect(readEmojiInput('👩🏽‍').emoji).toBe('👩🏽'); // trailing joiner left behind
    expect(readEmojiInput('\u{1F3FD}').emoji).toBeNull(); // lone modifier
  });

  test('an unsupported keycap is reported, the previous emoji is kept', () => {
    expect(readEmojiInput('📚1️⃣')).toEqual({ emoji: '📚', hadOtherText: false, unsupported: true });
  });
});

describe('note validation (length rule unchanged)', () => {
  test('emoji alone, body alone, or both are fine; neither is not', () => {
    expect(validateStatus({ emoji: '🧑‍🤝‍🧑', body: '' })).toBeNull();
    expect(validateStatus({ emoji: null, body: 'Library' })).toBeNull();
    expect(validateStatus({ emoji: null, body: '  ' })).not.toBeNull();
  });

  test('100 characters max for the text, counted as the database counts', () => {
    expect(validateStatus({ emoji: null, body: 'x'.repeat(100) })).toBeNull();
    expect(validateStatus({ emoji: null, body: 'x'.repeat(101) })).not.toBeNull();
  });

  test('an emoji the database would refuse is caught before saving', () => {
    expect(validateStatus({ emoji: 'ab', body: 'hi' })).not.toBeNull();
  });
});

describe('feedback validation', () => {
  const { validateFeedback, FEEDBACK_MAX_CHARS } = jest.requireActual('@/lib/feedback') as typeof import('@/lib/feedback');
  test('requires a category and 1–2000 characters', () => {
    expect(validateFeedback({ category: null, message: 'hi' })).toMatch(/Choose/);
    expect(validateFeedback({ category: 'bug', message: '   ' })).toMatch(/few words/);
    expect(validateFeedback({ category: 'other', message: 'x'.repeat(FEEDBACK_MAX_CHARS) })).toBeNull();
    expect(validateFeedback({ category: 'other', message: 'x'.repeat(FEEDBACK_MAX_CHARS + 1) })).toMatch(/under/);
  });
});
