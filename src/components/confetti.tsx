import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/providers/theme';

const PIECES = 64;
const DURATION_MS = 1700;
/** The burst starts slightly above the middle of the screen, where the success message sits. */
export const CONFETTI_ORIGIN = { x: 0.5, y: 0.42 } as const;
/** Animation progress samples used to approximate the flight curve. */
const SAMPLES = [0, 0.12, 0.25, 0.4, 0.6, 0.8, 1];

export type ConfettiPiece = {
  /** Launch direction in radians (0 = right, π/2 = down). */
  angle: number;
  /** How far the piece flies outward, in points. */
  distance: number;
  delay: number;
  spin: number;
  size: number;
  color: string;
  shape: 'round' | 'strip' | 'square';
  /** Flight path, one point per SAMPLES entry, relative to the origin. */
  path: { x: number; y: number }[];
};

/** Deterministic pseudo-random in [0, 1) (no Math.random in render). */
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A radial burst: pieces leave the origin evenly in every direction (with a
 * little jitter), decelerate, then drift down under a soft gravity. Pure and
 * deterministic so it can be unit-tested.
 */
export function confettiPieces(count: number, width: number, height: number, palette: readonly string[]): ConfettiPiece[] {
  const reach = Math.min(width, height);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (seeded(i, 1) - 0.5) * 0.35;
    // Two rings (near and far) so the burst fills the space instead of forming a circle.
    const distance = reach * (i % 2 ? 0.28 + seeded(i, 2) * 0.16 : 0.42 + seeded(i, 2) * 0.2);
    const gravity = height * (0.1 + seeded(i, 3) * 0.08);
    const path = SAMPLES.map((t) => {
      const out = 1 - (1 - t) ** 3; // fast launch, gentle stop
      return {
        x: Math.cos(angle) * distance * out,
        y: Math.sin(angle) * distance * out + gravity * t * t,
      };
    });
    const shapeRoll = i % 3;
    return {
      angle,
      distance,
      delay: seeded(i, 4) * 0.08,
      spin: (i % 2 ? 1 : -1) * (200 + seeded(i, 5) * 400),
      size: 7 + (i % 4) * 2,
      color: palette[i % palette.length],
      shape: shapeRoll === 0 ? 'round' : shapeRoll === 1 ? 'strip' : 'square',
      path,
    };
  });
}

/**
 * A short, one-shot confetti burst from near the centre of the screen.
 * Purely decorative: it never blocks touches (pointerEvents="none"), runs on
 * the native driver, and stops its work when finished. Callers decide WHEN to
 * show it (after a confirmed save) and must not render it when the system
 * asks for reduced motion.
 */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const pieces = useMemo(
    () =>
      confettiPieces(PIECES, width, height, [
        colors.accent,
        '#C77700', // amber
        '#5B5BD6', // indigo
        '#C2378A', // magenta
        '#0B84C6', // ocean
        '#E06A50', // coral
        '#B8930F', // mustard
        '#9D7FE0', // lavender
      ]),
    [width, height, colors.accent],
  );
  const ox = width * CONFETTI_ORIGIN.x;
  const oy = height * CONFETTI_ORIGIN.y;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.linear, // the curve lives in each piece's path
      useNativeDriver: true,
    });
    anim.start(({ finished }) => finished && onDone?.());
    return () => anim.stop();
  }, [progress, onDone]);

  return (
    <View
      testID="confetti"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {/* A soft ring marks the origin for a moment. */}
      <Animated.View
        style={[
          styles.ring,
          {
            left: ox - 60,
            top: oy - 60,
            borderColor: colors.accent,
            opacity: progress.interpolate({ inputRange: [0, 0.05, 0.3], outputRange: [0, 0.45, 0], extrapolate: 'clamp' }),
            transform: [{ scale: progress.interpolate({ inputRange: [0, 0.3], outputRange: [0.2, 1.6], extrapolate: 'clamp' }) }],
          },
        ]}
      />
      {pieces.map((p, i) => {
        const input = SAMPLES.map((t) => p.delay + t * (1 - p.delay));
        const local = progress.interpolate({ inputRange: [0, p.delay, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
        const h = p.shape === 'strip' ? p.size * 1.9 : p.size;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: ox - p.size / 2,
              top: oy - h / 2,
              width: p.size,
              height: h,
              borderRadius: p.shape === 'round' ? p.size / 2 : 2,
              backgroundColor: p.color,
              opacity: local.interpolate({ inputRange: [0, 0.04, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, ...input], outputRange: [0, ...p.path.map((q) => q.x)], extrapolate: 'clamp' }) },
                { translateY: progress.interpolate({ inputRange: [0, ...input], outputRange: [0, ...p.path.map((q) => q.y)], extrapolate: 'clamp' }) },
                { scale: local.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0.3, 1.15, 0.85] }) },
                { rotate: local.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 3 },
});
