import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { APP_NAME } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/providers/theme';

/**
 * The Lockt mark: an open book whose centre gutter is a keyhole, set in a
 * soft forest-green badge.
 *
 *  - the book: studying, journaling what you got done;
 *  - the keyhole in the gutter: "locking in" to focus (without a padlock);
 *  - the two pages leaning toward each other: studying alongside friends.
 *
 * Drawn on a 64-unit grid with a 3-unit gutter so it stays legible from 16 px
 * (favicon) upward. Colours come from the theme: badge = accent, pages =
 * onAccent, keyhole = accent, so it works on warm light and dark surfaces.
 */
export const LOGO_PATHS = {
  // Left and right pages: gently curved tops, flat bottoms meeting at the spine.
  leftPage: 'M30.5 19.5C25.5 16.2 19.4 15.3 13 16.4c-.9.2-1.5.9-1.5 1.8v26.3c0 1.1 1 1.9 2.1 1.8 6-.8 11.7.2 16.9 3.2V19.5Z',
  rightPage: 'M33.5 19.5c5-3.3 11.1-4.2 17.5-3.1.9.2 1.5.9 1.5 1.8v26.3c0 1.1-1 1.9-2.1 1.8-6-.8-11.7.2-16.9 3.2V19.5Z',
  // Keyhole stem (the circle is drawn separately).
  keyholeStem: 'M30.2 31.5h3.6l1.4 9.3c.1.6-.4 1.2-1 1.2h-4.4c-.6 0-1.1-.6-1-1.2l1.4-9.3Z',
} as const;

export function LogoMark({ size = 40, style, title }: { size?: number; style?: StyleProp<ViewStyle>; title?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessible={!!title}
      accessibilityRole={title ? 'image' : undefined}
      accessibilityLabel={title}
      accessibilityElementsHidden={!title}
      importantForAccessibility={title ? 'yes' : 'no-hide-descendants'}
      testID="lockt-logo">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect x={0} y={0} width={64} height={64} rx={17} fill={colors.accent} />
        <Path d={LOGO_PATHS.leftPage} fill={colors.onAccent} />
        <Path d={LOGO_PATHS.rightPage} fill={colors.onAccent} />
        <Circle cx={32} cy={29.5} r={4.6} fill={colors.accent} />
        <Path d={LOGO_PATHS.keyholeStem} fill={colors.accent} />
      </Svg>
    </View>
  );
}

/** Mark + serif wordmark. `size` is the mark's size; the wordmark scales with it. */
export function Logo({
  size = 32,
  layout = 'row',
  style,
}: {
  size?: number;
  layout?: 'row' | 'stacked';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const stacked = layout === 'stacked';
  const fontSize = Math.round(size * (stacked ? 0.52 : 0.72));
  return (
    <View
      style={[
        { flexDirection: stacked ? 'column' : 'row', alignItems: 'center', gap: stacked ? Spacing.sm : Math.round(size * 0.28) },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${APP_NAME} logo`}>
      <LogoMark size={size} />
      <AppText
        variant="display"
        color={colors.text}
        maxFontSizeMultiplier={1.3}
        style={{ fontSize, lineHeight: Math.round(fontSize * 1.25), letterSpacing: -0.3 }}>
        {APP_NAME}
      </AppText>
    </View>
  );
}
