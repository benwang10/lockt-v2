import { Text, type TextProps } from 'react-native';

import { MAX_FONT_SCALE, Type } from '@/constants/theme';
import { useTheme } from '@/providers/theme';

export type TextVariant = keyof typeof Type;

/**
 * All app text goes through here so typography (serif by default, sans for
 * compact metadata) and theme colours stay consistent. Respects the system
 * text size, with a per-variant cap for the very large styles.
 */
export function AppText({
  variant = 'body',
  color,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps & { variant?: TextVariant; color?: string }) {
  const { colors } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE[variant] ?? 2}
      {...rest}
      style={[Type[variant], { color: color ?? colors.text }, style]}
    />
  );
}
