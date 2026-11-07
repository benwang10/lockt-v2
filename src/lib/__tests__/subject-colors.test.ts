import {
  AVATAR_COLORS,
  contrastRatio,
  DEFAULT_SUBJECT_COLOR,
  FOREST_GREEN,
  onSubjectColor,
  Palettes,
  SUBJECT_PALETTE,
  subjectColor,
  subjectColorName,
  SubjectColors,
} from '@/constants/theme';

/** The ten colours shipped in v1/v2: saved subjects use these exact values. */
const LEGACY = ['#5B5BD6', '#0B84C6', '#0F8A5F', '#C77700', '#D13B3B', '#C2378A', '#7C4DDB', '#0E8C8C', '#E0601B', '#5E6B7A'];

function hexToLab(hex: string) {
  const lin = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const xyz = [
    (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047,
    r * 0.2126 + g * 0.7152 + b * 0.0722,
    (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883,
  ].map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

describe('subject palette', () => {
  test('keeps every v1/v2 colour with its exact value', () => {
    for (const hex of LEGACY) expect(SubjectColors).toContain(hex);
  });

  test('is larger, unique, valid hex, and named', () => {
    expect(SubjectColors.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SubjectColors.map((c) => c.toLowerCase())).size).toBe(SubjectColors.length);
    for (const { hex, name } of SUBJECT_PALETTE) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(name.length).toBeGreaterThan(0);
      expect(subjectColorName(hex)).toBe(name);
    }
  });

  test('covers greens, blues, purples, pinks, reds, oranges, yellows and neutrals', () => {
    const names = SUBJECT_PALETTE.map((c) => c.name);
    for (const n of ['Forest', 'Sage', 'Ocean', 'Navy', 'Violet', 'Lavender', 'Rose', 'Magenta', 'Brick', 'Coral', 'Orange', 'Mustard', 'Cocoa', 'Stone']) {
      expect(names).toContain(n);
    }
  });

  test('every colour stays visible as a dot/bar on both warm surfaces (≥ 2.5:1)', () => {
    for (const hex of SubjectColors) {
      expect(contrastRatio(hex, Palettes.light.surface)).toBeGreaterThanOrEqual(2.5);
      expect(contrastRatio(hex, Palettes.dark.surface)).toBeGreaterThanOrEqual(2.5);
      expect(contrastRatio(hex, Palettes.dark.chartTrack)).toBeGreaterThanOrEqual(2);
    }
  });

  test('colours are distinguishable from each other (ΔE76 ≥ 12)', () => {
    for (let i = 0; i < SubjectColors.length; i++) {
      for (let j = i + 1; j < SubjectColors.length; j++) {
        const [a, b] = [hexToLab(SubjectColors[i]), hexToLab(SubjectColors[j])];
        const dE = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (dE < 12) throw new Error(`${SubjectColors[i]} and ${SubjectColors[j]} are too similar (ΔE ${dE.toFixed(1)})`);
      }
    }
  });

  test('the check mark on a selected swatch is readable (≥ 3:1)', () => {
    for (const hex of SubjectColors) expect(contrastRatio(onSubjectColor(hex), hex)).toBeGreaterThanOrEqual(3);
  });

  test('forest green remains the fallback for missing or invalid colours', () => {
    expect(subjectColor(null)).toBe(FOREST_GREEN);
    expect(subjectColor(undefined)).toBe(FOREST_GREEN);
    expect(subjectColor('red')).toBe(FOREST_GREEN);
    expect(subjectColor('#12345')).toBe(FOREST_GREEN);
    expect(subjectColor('#9d7fe0')).toBe('#9d7fe0');
    expect(subjectColorName('#123456')).toBe('Custom colour');
  });

  test('new subjects still default to indigo, and avatars keep their original colours', () => {
    expect(DEFAULT_SUBJECT_COLOR).toBe('#5B5BD6');
    expect([...AVATAR_COLORS]).toEqual(LEGACY);
  });
});
