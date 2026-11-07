import { CONFETTI_ORIGIN, confettiPieces } from '@/components/confetti';

jest.mock('@/providers/theme', () => ({ useTheme: () => ({ colors: { accent: '#0B6E5F' } }) }));

describe('confetti burst geometry', () => {
  const pieces = confettiPieces(64, 390, 844, ['#111111', '#222222']);

  test('starts near the centre of the screen', () => {
    expect(CONFETTI_ORIGIN.x).toBe(0.5);
    expect(CONFETTI_ORIGIN.y).toBeGreaterThan(0.3);
    expect(CONFETTI_ORIGIN.y).toBeLessThan(0.6);
    for (const p of pieces) {
      expect(p.path[0].x).toBeCloseTo(0);
      expect(p.path[0].y).toBeCloseTo(0);
    }
  });

  test('spreads outward radially in every direction', () => {
    const quadrants = new Set(
      pieces.map((p) => {
        const peak = p.path[3]; // mid-flight, before gravity dominates
        return `${Math.sign(peak.x)}${Math.sign(peak.y)}`;
      }),
    );
    expect(quadrants).toEqual(new Set(['11', '1-1', '-11', '-1-1']));
    // Wide: the farthest pieces travel well beyond a third of the screen width from the origin.
    const farthest = Math.max(...pieces.map((p) => Math.hypot(p.path[3].x, p.path[3].y)));
    expect(farthest).toBeGreaterThan(390 * 0.4);
  });

  test('is deterministic (no layout jumps between renders)', () => {
    expect(confettiPieces(64, 390, 844, ['#111111', '#222222'])).toEqual(pieces);
  });
});
