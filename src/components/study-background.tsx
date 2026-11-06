import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Animated, AppState, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import {
  loadPreference,
  savePreference,
  STUDY_BACKGROUND_PREFERENCE,
} from '@/lib/device-preferences';
import { useTheme } from '@/providers/theme';

export type StudyBackgroundKind = 'off' | 'rain' | 'bubbles' | 'leaves';

export const STUDY_BACKGROUNDS: { value: StudyBackgroundKind; label: string; icon: 'stopCircle' | 'rain' | 'bubbles' | 'leaf' }[] = [
  { value: 'off', label: 'Off', icon: 'stopCircle' },
  { value: 'rain', label: 'Rain', icon: 'rain' },
  { value: 'bubbles', label: 'Bubbles', icon: 'bubbles' },
  { value: 'leaves', label: 'Leaves', icon: 'leaf' },
];

// ---------------------------------------------------------------------------
// Device preference (shared by the start form and the running timer)
// ---------------------------------------------------------------------------
let current: StudyBackgroundKind = 'off';
let loaded = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    loadPreference(STUDY_BACKGROUND_PREFERENCE).then((value) => {
      current = value;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useStudyBackground(): [StudyBackgroundKind, (next: StudyBackgroundKind) => void] {
  const value = useSyncExternalStore(subscribe, () => current, () => current);
  const set = (next: StudyBackgroundKind) => {
    current = next;
    listeners.forEach((l) => l());
    savePreference(STUDY_BACKGROUND_PREFERENCE, next).catch(() => undefined);
  };
  return [value, set];
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
type Particle = { x: number; phase: number; size: number; sway: number; speed: number };

const SCENES: Record<Exclude<StudyBackgroundKind, 'off'>, { count: number; loopMs: number }> = {
  rain: { count: 26, loopMs: 2600 },
  bubbles: { count: 14, loopMs: 14000 },
  leaves: { count: 9, loopMs: 18000 },
};

/** Deterministic pseudo-random in [0, 1) so layouts are stable between renders. */
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A calm, procedural "screensaver" behind the study timer. Purely visual:
 * the timer reads persisted timestamps and never depends on these frames.
 *
 * Motion runs only while `animate` is true AND the screen is focused AND the
 * app is in the foreground AND the system doesn't ask for reduced motion.
 * Otherwise a still frame is shown (or nothing for "off"). One looping value
 * drives every particle on the native driver; nothing re-renders per frame.
 */
export function StudyBackground({ kind, animate }: { kind: StudyBackgroundKind; animate: boolean }) {
  const { colors, scheme } = useTheme();
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const moving = kind !== 'off' && animate && focused && appActive && !reduceMotion && size.height > 0;
  const scene = kind === 'off' ? null : SCENES[kind];

  useEffect(() => {
    if (!moving || !scene) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: scene.loopMs, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop(); // stops all animation work when hidden / paused / backgrounded
  }, [moving, scene, progress]);

  const particles = useMemo<Particle[]>(() => {
    if (!scene) return [];
    return Array.from({ length: scene.count }, (_, i) => ({
      x: seeded(i, 1),
      phase: seeded(i, 2),
      size: seeded(i, 3),
      sway: seeded(i, 4) - 0.5,
      speed: 0.75 + seeded(i, 5) * 0.5,
    }));
  }, [scene]);

  if (kind === 'off') return null;

  const dark = scheme === 'dark';
  const tintColor =
    kind === 'rain'
      ? dark ? 'rgba(170, 200, 215, 0.30)' : 'rgba(60, 100, 120, 0.22)'
      : kind === 'bubbles'
        ? dark ? 'rgba(140, 214, 187, 0.18)' : 'rgba(11, 110, 95, 0.12)'
        : dark ? 'rgba(160, 196, 120, 0.30)' : 'rgba(80, 120, 40, 0.24)';

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  return (
    <View
      testID="study-background"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {/* Soft wash so the scene reads as atmosphere, not content. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(30, 58, 48, 0.18)' : 'rgba(226, 239, 231, 0.45)' }]} />
      {size.height > 0
        ? particles.map((p, i) => (
            <ParticleView key={`${kind}-${i}`} kind={kind} p={p} progress={progress} size={size} color={tintColor} still={!moving} />
          ))
        : null}
      {/* Readability scrim behind the timer content. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: 0.35 }]} />
    </View>
  );
}

function ParticleView({
  kind,
  p,
  progress,
  size,
  color,
  still,
}: {
  kind: Exclude<StudyBackgroundKind, 'off'>;
  p: Particle;
  progress: Animated.Value;
  size: { width: number; height: number };
  color: string;
  still: boolean;
}) {
  // Each particle runs at its own speed and phase on the shared loop.
  const t = useMemo(() => {
    if (still) return new Animated.Value(p.phase).interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    return Animated.modulo(Animated.add(Animated.multiply(progress, p.speed), p.phase), 1).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
  }, [still, progress, p]);
  const H = size.height;
  const W = size.width;

  if (kind === 'rain') {
    const length = 14 + p.size * 18;
    return (
      <Animated.View
        style={{
          position: 'absolute',
          left: p.x * W,
          top: -length,
          width: 1.5,
          height: length,
          borderRadius: 1,
          backgroundColor: color,
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, H + length * 2] }) },
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -H * 0.08] }) },
            { rotate: '8deg' },
          ],
        }}
      />
    );
  }

  if (kind === 'bubbles') {
    const d = 10 + p.size * 34;
    return (
      <Animated.View
        style={{
          position: 'absolute',
          left: p.x * W - d / 2,
          top: H,
          width: d,
          height: d,
          borderRadius: d / 2,
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: color.replace(/[\d.]+\)$/, '0.06)'),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -(H + d * 2)] }) },
            { translateX: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, p.sway * 24, 0, -p.sway * 24, 0] }) },
          ],
        }}
      />
    );
  }

  // Leaves: a rounded leaf shape drifting down with a slow sway and turn.
  const w = 14 + p.size * 12;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: p.x * W,
        top: -w * 2,
        width: w,
        height: w * 0.6,
        backgroundColor: color,
        borderTopLeftRadius: w,
        borderBottomRightRadius: w,
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, H + w * 4] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: [0, p.sway * 60, -p.sway * 30, p.sway * 40] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', `${p.sway > 0 ? 160 : -160}deg`] }) },
        ],
      }}
    />
  );
}
