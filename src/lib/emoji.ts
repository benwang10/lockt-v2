/**
 * Emoji handling for Notes, without a picker dependency.
 *
 * People type an emoji with their phone's emoji keyboard, or on a computer
 * with the system picker (Windows + . / Ctrl + Cmd + Space) or by pasting.
 * We segment what they typed into emoji "clusters" (the units a person sees
 * as one emoji) and keep the most recent one. Supported sequences:
 *
 *  - single pictographs, with an optional variation selector (☕, ✍️)
 *  - skin-tone modifiers (👍🏽)
 *  - ZWJ sequences (👩🏽‍💻, 🧑‍🤝‍🧑, 🏳️‍🌈)
 *  - flags made of two regional indicators (🇺🇸) and tag sequences (🏴󠁧󠁢󠁳󠁣󠁴󠁿)
 *  - keycaps # and * (#️⃣). Digit keycaps (1️⃣) contain a digit, which the
 *    database deliberately rejects, so they are reported as unsupported.
 *
 * Hand-written code-point ranges are used instead of `\p{Extended_Pictographic}`
 * or Intl.Segmenter so behaviour is identical on Hermes, JSC and browsers.
 */

/** Must match the database check on profile_statuses.emoji (char_length counts code points). */
export const EMOJI_MAX_CODE_POINTS = 16;

const ZWJ = 0x200d;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;

const PICTOGRAPHIC_RANGES: [number, number][] = [
  [0x00a9, 0x00a9],
  [0x00ae, 0x00ae],
  [0x203c, 0x203c],
  [0x2049, 0x2049],
  [0x2122, 0x2122],
  [0x2139, 0x2139],
  [0x2194, 0x2199],
  [0x21a9, 0x21aa],
  [0x231a, 0x231b],
  [0x2328, 0x2328],
  [0x23cf, 0x23cf],
  [0x23e9, 0x23f3],
  [0x23f8, 0x23fa],
  [0x24c2, 0x24c2],
  [0x25aa, 0x25ab],
  [0x25b6, 0x25b6],
  [0x25c0, 0x25c0],
  [0x25fb, 0x25fe],
  [0x2600, 0x27bf],
  [0x2934, 0x2935],
  [0x2b05, 0x2b07],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x3030, 0x3030],
  [0x303d, 0x303d],
  [0x3297, 0x3297],
  [0x3299, 0x3299],
  [0x1f000, 0x1f0ff],
  [0x1f10d, 0x1f10f],
  [0x1f12f, 0x1f12f],
  [0x1f16c, 0x1f171],
  [0x1f17e, 0x1f17f],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f1ad, 0x1f1e5],
  [0x1f201, 0x1f2ff],
  [0x1f300, 0x1f3fa], // stops before the skin-tone modifiers
  [0x1f400, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f774, 0x1f77f],
  [0x1f7d5, 0x1f7ff],
  [0x1f80c, 0x1f80f],
  [0x1f848, 0x1f84f],
  [0x1f85a, 0x1f85f],
  [0x1f888, 0x1f88f],
  [0x1f8ae, 0x1f8ff],
  [0x1f90c, 0x1f9ff],
  [0x1fa00, 0x1faff],
  [0x1fc00, 0x1fffd],
];

const inRange = (cp: number, ranges: [number, number][]) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
const isPictographic = (cp: number) => inRange(cp, PICTOGRAPHIC_RANGES);
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
const isTag = (cp: number) => cp >= 0xe0020 && cp <= 0xe007f;
const isKeycapBase = (cp: number) => cp === 0x23 || cp === 0x2a || (cp >= 0x30 && cp <= 0x39);

export type EmojiSegment = { text: string; emoji: boolean };

/** Splits text into emoji clusters and other characters. */
export function segmentEmoji(input: string): EmojiSegment[] {
  const cps = Array.from(input).map((ch) => ch.codePointAt(0)!);
  const out: EmojiSegment[] = [];
  let i = 0;
  const take = (from: number, to: number, emoji: boolean) => {
    out.push({ text: String.fromCodePoint(...cps.slice(from, to)), emoji });
  };
  /** Consumes modifiers that attach to an emoji element; returns the new index. */
  const modifiers = (j: number) => {
    while (j < cps.length && (cps[j] === VS16 || cps[j] === VS15 || isSkinTone(cps[j]) || isTag(cps[j]))) j++;
    return j;
  };
  while (i < cps.length) {
    const cp = cps[i];
    // Flags: a pair of regional indicators.
    if (isRegionalIndicator(cp) && i + 1 < cps.length && isRegionalIndicator(cps[i + 1])) {
      take(i, i + 2, true);
      i += 2;
      continue;
    }
    // Keycaps: base [+ VS16] + U+20E3.
    if (isKeycapBase(cp)) {
      let j = i + 1;
      if (cps[j] === VS16) j++;
      if (cps[j] === KEYCAP) {
        take(i, j + 1, true);
        i = j + 1;
        continue;
      }
      take(i, i + 1, false);
      i++;
      continue;
    }
    if (isPictographic(cp)) {
      let j = modifiers(i + 1);
      // ZWJ sequences: element (ZWJ element)*
      while (j + 1 < cps.length && cps[j] === ZWJ && (isPictographic(cps[j + 1]) || isRegionalIndicator(cps[j + 1]))) {
        j = modifiers(j + 2);
      }
      take(i, j, true);
      i = j;
      continue;
    }
    // A lone skin tone / joiner / selector left over from editing: drop it silently.
    if (isSkinTone(cp) || cp === ZWJ || cp === VS16 || cp === VS15 || isTag(cp) || cp === KEYCAP) {
      i++;
      continue;
    }
    take(i, i + 1, false);
    i++;
  }
  return out;
}

export type EmojiInputResult = {
  /** The emoji to keep (most recently typed), or null when there is none. */
  emoji: string | null;
  /** The input also contained letters, digits or other non-emoji characters. */
  hadOtherText: boolean;
  /** The last emoji typed can't be saved (e.g. a digit keycap or an over-long sequence). */
  unsupported: boolean;
};

/**
 * Interprets what was typed into the emoji field. Typing a new emoji next to
 * the current one replaces it, so editing never needs a select-all first.
 */
export function readEmojiInput(input: string): EmojiInputResult {
  const segments = segmentEmoji(input);
  const emojis = segments.filter((s) => s.emoji);
  const hadOtherText = segments.some((s) => !s.emoji && s.text.trim().length > 0);
  for (let k = emojis.length - 1; k >= 0; k--) {
    const candidate = emojis[k].text;
    if (isSupportedEmoji(candidate)) return { emoji: candidate, hadOtherText, unsupported: k !== emojis.length - 1 };
  }
  return { emoji: null, hadOtherText, unsupported: emojis.length > 0 };
}

/** One emoji cluster the database accepts: ≤ 16 code points, no letters, digits or spaces. */
export function isSupportedEmoji(value: string): boolean {
  const segments = segmentEmoji(value);
  if (segments.length !== 1 || !segments[0].emoji || segments[0].text !== value) return false;
  if (Array.from(value).length > EMOJI_MAX_CODE_POINTS) return false;
  return !/[0-9A-Za-z\s]/.test(value);
}
