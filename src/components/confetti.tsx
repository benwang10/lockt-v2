import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SubjectColors } from '@/constants/theme';
import { useTheme } from '@/providers/theme';

const PIECES = 36;
const DURATION_MS = 1900;

type Piece = { x: number; delay: number; drift: number; spin: number; size: number; color: string; round: boolean };

/**
 * A short, one-shot confetti burst. Purely decorative: it never blocks
 * touches (pointerEvents="none"), runs on the native driver, and unmounts its
 * work when finished. Callers decide WHEN to show it (after a confirmed save)
 * and must not render it when the system asks for reduced motion.
 */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const pieces = useMemo<Piece[]>(() => {
    const palette = [colors.accent, ...SubjectColors.slice(0, 6)];
    // Deterministic spread (no Math.random in render).
    return Array.from({ length: PIECES }, (_, i) => {
      const t = (i * 7919) % 101 / 101;
      return {
        x: ((i + 0.5) / PIECES) * width,
        delay: t * 0.25,
        drift: (t - 0.5) * 120,
        spin: (i % 2 ? 1 : -1) * (180 + t * 360),
        size: 6 + (i % 4) * 2,
        color: palette[i % palette.length],
        round: i % 3 === 0,
      };
    });
  }, [width, colors.accent]);

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => finished && onDone?.());
    return () => anim.stop();
  }, [progress, onDone]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pieces.map((p, i) => {
        const start = p.delay;
        const local = progress.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: -20,
              width: p.size,
              height: p.round ? p.size : p.size * 1.6,
              borderRadius: p.round ? p.size / 2 : 2,
              backgroundColor: p.color,
              opacity: local.interpolate({ inputRange: [0, 0.05, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: local.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.75] }) },
                { translateX: local.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                { rotate: local.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
