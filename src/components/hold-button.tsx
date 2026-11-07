import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { makeStyles, useTheme } from '@/providers/theme';

export const HOLD_TO_FINISH_MS = 3000;

type KeyEventLike = { nativeEvent?: { key?: string; repeat?: boolean }; key?: string; repeat?: boolean; preventDefault?: () => void };

/**
 * Hold-to-confirm logic, separate from presentation.
 *
 * Completion is decided by ELAPSED WALL-CLOCK TIME since the hold began
 * (Date.now()), checked by a timer — never by counting animation frames.
 * Any interruption cancels and resets: release, pointer leaving, gesture
 * termination, focus loss, the screen losing focus, unmounting, or the app
 * going to the background (a hold that was backgrounded can never complete
 * on resume because its timer is cleared and its start time discarded).
 * `onComplete` fires at most once per hold.
 */
export function useHoldToConfirm({
  durationMs = HOLD_TO_FINISH_MS,
  onComplete,
  enabled,
}: {
  durationMs?: number;
  onComplete: () => void;
  enabled: boolean;
}) {
  const startedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completed = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const cancel = useCallback(() => {
    clearTimer();
    startedAt.current = null;
    completed.current = false;
    setHolding(false);
  }, []);

  const begin = useCallback(() => {
    if (!enabled || startedAt.current !== null) return; // ignore repeats while holding
    if (AppState.currentState !== 'active' && Platform.OS !== 'web') return;
    completed.current = false;
    const start = Date.now();
    startedAt.current = start;
    setHolding(true);
    clearTimer();
    timer.current = setTimeout(function check() {
      // A cancelled or restarted hold must never complete through an old timer.
      if (startedAt.current !== start || completed.current) return;
      const elapsed = Date.now() - start;
      if (elapsed >= durationMs) {
        completed.current = true;
        timer.current = null;
        startedAt.current = null;
        setHolding(false);
        onCompleteRef.current();
      } else {
        // Timers can fire early; wait for the remaining time.
        timer.current = setTimeout(check, durationMs - elapsed);
      }
    }, durationMs);
  }, [enabled, durationMs]);

  // Backgrounding (or the tab becoming hidden on web) cancels the hold.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancel();
    });
    return () => sub.remove();
  }, [cancel]);

  // Disabled (busy, or the screen lost focus) or unmounted: nothing may complete later.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    // Adjusting state during render (not in an effect) when `enabled` changes.
    setWasEnabled(enabled);
    if (!enabled) setHolding(false);
  }
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      startedAt.current = null;
    }
  }, [enabled]);
  useEffect(() => () => clearTimer(), []);

  return { begin, cancel, holding };
}

/**
 * "Hold to finish" button: the press must last `durationMs` without
 * interruption. Shows a filling progress bar and, unless reduced motion is
 * on, a subtle shake while held. Supports touch, mouse and keyboard
 * (Space/Enter held down; key repeat is ignored). A quick tap or click does
 * nothing except explain what to do.
 */
export function HoldButton({
  title,
  icon,
  onComplete,
  disabled = false,
  loading = false,
  durationMs = HOLD_TO_FINISH_MS,
  style,
  accessibilityHint,
}: {
  title: string;
  icon?: IconName;
  onComplete: () => void;
  disabled?: boolean;
  loading?: boolean;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  const enabled = !disabled && !loading && focused;
  const { begin, cancel, holding } = useHoldToConfirm({ durationMs, onComplete, enabled });
  const [width, setWidth] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  const [tapped, setTapped] = useState(false);
  const keyDown = useRef(false);
  const pointerDown = useRef(false);
  // `enabled` includes screen focus, so leaving the screen cancels the hold.
  const start = () => {
    setTapped(false);
    begin();
  };

  // Visual progress only; completion is decided by elapsed time in the hook.
  useEffect(() => {
    if (holding) {
      progress.setValue(0);
      const fill = Animated.timing(progress, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: true });
      fill.start();
      let wobble: Animated.CompositeAnimation | null = null;
      if (!reduceMotion) {
        wobble = Animated.loop(
          Animated.sequence([
            Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
            Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
            Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
            Animated.delay(60),
          ]),
        );
        wobble.start();
      }
      return () => {
        fill.stop();
        wobble?.stop();
        shake.setValue(0);
        progress.setValue(0);
      };
    }
  }, [holding, durationMs, reduceMotion, progress, shake]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const release = () => {
    keyDown.current = false;
    pointerDown.current = false;
    if (holding) {
      // Released early (or a quick tap): explain, inside the button so nothing shifts.
      setTapped(true);
      AccessibilityInfo.announceForAccessibility?.(`Hold for ${Math.round(durationMs / 1000)} seconds to finish`);
    }
    cancel();
  };

  // The hint reverts to the normal label after a moment.
  useEffect(() => {
    if (!tapped) return;
    const t = setTimeout(() => setTapped(false), 2500);
    return () => clearTimeout(t);
  }, [tapped]);

  /**
   * Web input is handled directly, not through react-native-web's press
   * responder: after a pointer was dragged off the button and released
   * outside, the responder ignored the next press (found in browser testing).
   * Pointer events cover mouse, touch and pen. With touch the browser keeps
   * sending events to the button (implicit capture), so leaving it is
   * detected from the pointer position.
   */
  type PointerEventLike = {
    nativeEvent: { button?: number; pointerType?: string; clientX: number; clientY: number };
    currentTarget: { getBoundingClientRect?: () => { left: number; right: number; top: number; bottom: number } };
    preventDefault?: () => void;
  };
  const webHandlers =
    Platform.OS === 'web'
      ? {
          onPointerDown: (e: PointerEventLike) => {
            if (!enabled || keyDown.current) return;
            if (e.nativeEvent.pointerType === 'mouse' && e.nativeEvent.button !== 0) return;
            pointerDown.current = true;
            start();
          },
          onPointerUp: () => {
            if (pointerDown.current) release();
          },
          onPointerCancel: () => {
            if (pointerDown.current) release();
          },
          // Mouse dragged off the button.
          onPointerLeave: () => {
            if (pointerDown.current) release();
          },
          // Finger (or pen) dragged off the button, with a little slop.
          onPointerMove: (e: PointerEventLike) => {
            if (!pointerDown.current) return;
            const r = e.currentTarget.getBoundingClientRect?.();
            if (!r) return;
            const { clientX: x, clientY: y } = e.nativeEvent;
            const slop = 12;
            if (x < r.left - slop || x > r.right + slop || y < r.top - slop || y > r.bottom + slop) release();
          },
          // A long press must not open the browser's context menu or select text.
          onContextMenu: (e: { preventDefault?: () => void }) => e.preventDefault?.(),
          onKeyDown: (e: KeyEventLike) => {
            const key = e.nativeEvent?.key ?? e.key;
            if (key !== ' ' && key !== 'Enter' && key !== 'Spacebar') return;
            e.preventDefault?.();
            if (e.nativeEvent?.repeat ?? e.repeat) return;
            if (keyDown.current) return;
            keyDown.current = true;
            start();
          },
          onKeyUp: (e: KeyEventLike) => {
            const key = e.nativeEvent?.key ?? e.key;
            if (key !== ' ' && key !== 'Enter' && key !== 'Spacebar') return;
            release();
          },
        }
      : {
          // Native: the press responder reports release, the finger leaving the
          // button and interruptions (e.g. a scroll taking over) as press-out.
          onPressIn: () => start(),
          onPressOut: () => release(),
        };

  const fg = colors.onAccent;
  const seconds = Math.round(durationMs / 1000);
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-1.5, 1.5] }) }],
        },
      ]}>
      <Pressable
        testID="hold-button"
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint ?? `Press and hold for ${seconds} seconds.`}
        accessibilityState={{ disabled: !enabled, busy: loading }}
        aria-busy={loading}
        accessibilityValue={holding ? { text: 'Keep holding' } : undefined}
        disabled={!enabled}
        // Starts at once (no press-in delay); there is deliberately no onPress,
        // so a tap or click can never finish.
        unstable_pressDelay={0}
        delayLongPress={durationMs * 10}
        onBlur={() => {
          keyDown.current = false;
          pointerDown.current = false;
          cancel();
        }}
        onLayout={onLayout}
        {...(webHandlers as object)}
        style={[
          styles.base,
          Platform.OS === 'web' && styles.web,
          { backgroundColor: holding ? colors.accentStrong : colors.accent, opacity: !enabled && !loading ? 0.5 : 1 },
        ]}>
        {/* Progress fill: slides in from the left over the hold duration. */}
        <Animated.View
          pointerEvents="none"
          testID="hold-progress"
          style={[
            StyleSheet.absoluteFill,
            styles.fill,
            {
              backgroundColor: scheme === 'dark' ? 'rgba(15, 33, 26, 0.22)' : 'rgba(255, 255, 255, 0.3)',
              opacity: holding ? 1 : 0,
              transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-Math.max(width, 1), 0] }) }],
            },
          ]}
        />
        <View style={[styles.row, loading && styles.hidden]}>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <AppText variant="bodyStrong" color={fg} numberOfLines={2} style={styles.label}>
            {holding ? 'Keep holding…' : tapped && !loading ? `Hold for ${seconds} seconds to finish` : title}
          </AppText>
        </View>
        {loading ? (
          <View style={styles.spinner} pointerEvents="none">
            <ActivityIndicator color={fg} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  base: {
    minHeight: Math.max(56, TOUCH_TARGET),
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    overflow: 'hidden',
  },
  fill: { borderRadius: Radius.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, maxWidth: '100%' },
  label: { textAlign: 'center', flexShrink: 1 },
  hidden: { opacity: 0 },
  spinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // No text selection, callout or scroll gesture while holding on touch screens.
  web: { userSelect: 'none', touchAction: 'none', WebkitTouchCallout: 'none' } as object,
}));
