import { Platform } from 'react-native';

/**
 * Cross-platform accessibility helpers.
 *
 * react-native-web (0.21) ignores the `accessibilityState` prop entirely, so a
 * radio, checkbox or toggle that only sets `accessibilityState` announces no
 * selected/checked state in the browser. React Native also understands the
 * `aria-*` props, so we pass both: native keeps working exactly as before and
 * the web gets real `aria-checked` / `aria-pressed` attributes.
 */
export function checkedA11y(checked: boolean, disabled?: boolean) {
  return {
    accessibilityState: { checked, selected: checked, ...(disabled != null ? { disabled } : {}) },
    'aria-checked': checked,
    ...(disabled != null ? { 'aria-disabled': disabled } : {}),
  } as const;
}

/** Toggle buttons (like): `aria-pressed` on web, `selected` state on native. */
export function pressedA11y(pressed: boolean) {
  return Platform.OS === 'web'
    ? ({ 'aria-pressed': pressed } as Record<string, unknown>)
    : { accessibilityState: { selected: pressed } };
}

type KeyLike = { key?: string; repeat?: boolean; preventDefault?: () => void; nativeEvent?: { key?: string; repeat?: boolean } };

/** Key handler logic, exported for tests: returns true when it activated. */
export function handleActivationKey(e: KeyLike, keys: readonly string[], onPress: () => void): boolean {
  const key = e.nativeEvent?.key ?? e.key;
  if (!key || !keys.includes(key)) return false;
  // Stop Space from scrolling the page.
  e.preventDefault?.();
  // Holding the key down must not fire again and again.
  if (e.nativeEvent?.repeat ?? e.repeat) return false;
  onPress();
  return true;
}

/**
 * On the web, react-native-web only activates `role="button"` elements with
 * the Space bar. Radios, checkboxes and similar controls expect Space too.
 * Spread the result onto a Pressable (no-op on native).
 */
export function webSpaceActivates(onPress: (() => void) | undefined, disabled = false): Record<string, unknown> {
  if (Platform.OS !== 'web' || !onPress || disabled) return {};
  return { onKeyDown: (e: KeyLike) => handleActivationKey(e, [' ', 'Spacebar'], onPress) };
}
