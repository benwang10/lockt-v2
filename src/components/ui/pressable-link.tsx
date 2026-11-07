import type { ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle, type PressableStateCallbackType } from 'react-native';

/**
 * A Pressable that behaves as a link on every platform.
 *
 * On the web, react-native-web renders `role="link"` as an element that
 * relies on the browser's native click for keyboard activation. Without an
 * `href` the browser never fires that click, so Enter did nothing on author
 * rows, user rows, buddy names and song cards (v2 web bug). Giving the
 * element its real `href` fixes Enter (and shows the URL on hover); the
 * default navigation is prevented so routing stays client-side, through
 * `onPress`, exactly like a tap.
 */
export function PressableLink({
  href,
  onPress,
  accessibilityLabel,
  style,
  hitSlop,
  external = false,
  testID,
  children,
}: {
  /** Route path ("/user/abc") or absolute URL (external links). */
  href: string;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  hitSlop?: PressableProps['hitSlop'];
  external?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const webProps =
    Platform.OS === 'web'
      ? { href, ...(external ? { hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } } : {}) }
      : {};
  return (
    <Pressable
      {...(webProps as object)}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      testID={testID}
      onPress={(e) => {
        // Keep navigation inside the app (and avoid a full page load) on the web.
        (e as unknown as { preventDefault?: () => void })?.preventDefault?.();
        onPress();
      }}
      style={style}>
      {children}
    </Pressable>
  );
}
