import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * The like heart, drawn as a vector so "liked" is a fully filled heart on
 * every platform. (The Material Symbols font that expo-symbols uses on web
 * and Android only ships the outlined style, so its "favorite" glyph was an
 * outline in both states there.) Outline and fill share one silhouette.
 */
const HEART =
  'M12 20.6c-.3 0-.6-.1-.8-.3C8.5 18 3 13.6 3 8.9 3 6.1 5.2 4 7.8 4c1.7 0 3.2.9 4.2 2.2C13 4.9 14.5 4 16.2 4 18.8 4 21 6.1 21 8.9c0 4.7-5.5 9.1-8.2 11.4-.2.2-.5.3-.8.3Z';

export function HeartIcon({ filled, color, size = 22 }: { filled: boolean; color: string; size?: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={filled ? 'heart-filled' : 'heart-outline'}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d={HEART}
          fill={filled ? color : 'none'}
          stroke={color}
          strokeWidth={filled ? 1.4 : 1.9}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
