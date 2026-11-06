import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { SANS, SERIF } from './fonts';

/**
 * Lockt visual identity: warm paper backgrounds, gentle neutral surfaces and
 * one forest-green accent. Subject colours add personality to cards/charts.
 *
 * Semantic colours live here for both schemes; components read them through
 * `useTheme()` / `makeStyles()` (src/providers/theme.tsx) and never hard-code
 * hex values. Every text colour meets WCAG AA (≥ 4.5:1) on `background`,
 * `surface` and `surfaceMuted` in its scheme, including muted labels and
 * input placeholders (`textMuted`).
 */
export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  /** Raised surface for sheets / modals. */
  surfaceRaised: string;
  border: string;
  text: string;
  textSecondary: string;
  /** Muted labels and placeholders (still AA). */
  textMuted: string;
  accent: string;
  /** Pressed state, and accent text on accentSoft. */
  accentStrong: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  dangerPressed: string;
  dangerSoft: string;
  onDanger: string;
  warning: string;
  warningSoft: string;
  like: string;
  /** High-contrast inverted surface (active-session banner, toasts). */
  inverse: string;
  onInverse: string;
  overlay: string;
  chartTrack: string;
  shadow: string;
};

/** The original forest green, the fallback for subjects without a valid colour. */
export const FOREST_GREEN = '#0B6E5F';

export const Palettes: Record<ThemeName, ThemeColors> = {
  light: {
    background: '#FAF6EE', // warm ivory
    surface: '#FFFDF8',
    surfaceMuted: '#F2ECE1',
    surfaceRaised: '#FFFDF8',
    border: '#E4DCCD',
    text: '#211D17',
    textSecondary: '#585044',
    textMuted: '#6A6255',
    accent: FOREST_GREEN,
    accentStrong: '#085246',
    accentSoft: '#E2EFE7',
    onAccent: '#FFFFFF',
    danger: '#B42318',
    dangerPressed: '#8F1C13',
    dangerSoft: '#FAE9E4',
    onDanger: '#FFFFFF',
    warning: '#8A5300',
    warningSoft: '#FBF0DB',
    like: '#D62F5B',
    inverse: '#2A251E',
    onInverse: '#FBF7EF',
    overlay: 'rgba(33, 29, 23, 0.45)',
    chartTrack: '#E9E2D4',
    shadow: '#3B2F1E',
  },
  dark: {
    background: '#1A1612', // warm brown-black
    surface: '#241F1A',
    surfaceMuted: '#2F2922',
    surfaceRaised: '#2B251F',
    border: '#3D362D',
    text: '#F3ECE0',
    textSecondary: '#CFC4B3',
    textMuted: '#AEA392',
    accent: '#6CC2A3', // forest green lifted for dark surfaces
    accentStrong: '#8ED6BB',
    accentSoft: '#1E3A30',
    onAccent: '#0F211A',
    danger: '#F28B7D',
    dangerPressed: '#D9705F',
    dangerSoft: '#3D221D',
    onDanger: '#2A0F0B',
    warning: '#E8B866',
    warningSoft: '#3A2E1A',
    like: '#F27393',
    inverse: '#EFE6D6',
    onInverse: '#1F1A15',
    overlay: 'rgba(0, 0, 0, 0.55)',
    chartTrack: '#352E26',
    shadow: '#000000',
  },
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Minimum touch target (Apple HIG 44pt / Material 48dp). */
export const TOUCH_TARGET = 44;
export const MAX_CONTENT_WIDTH = 640;

/**
 * Type scale. Serif (Source Serif 4) is the default voice; the sans (Inter)
 * is reserved for compact metadata (`caption`, `overline`, `label`) and the
 * timer. Line heights leave room for Source Serif's tall ascenders so
 * nothing clips on Android, and no style sets fontWeight (each weight is its
 * own family).
 */
export const Type = {
  display: { fontFamily: SERIF.bold, fontSize: 34, lineHeight: 44, letterSpacing: -0.4 },
  title: { fontFamily: SERIF.bold, fontSize: 26, lineHeight: 34, letterSpacing: -0.2 },
  heading: { fontFamily: SERIF.semibold, fontSize: 19, lineHeight: 26 },
  body: { fontFamily: SERIF.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: SERIF.semibold, fontSize: 16, lineHeight: 24 },
  italic: { fontFamily: SERIF.italic, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: SERIF.regular, fontSize: 14.5, lineHeight: 21 },
  smallStrong: { fontFamily: SERIF.semibold, fontSize: 14.5, lineHeight: 21 },
  /** Compact metadata (sans). */
  caption: { fontFamily: SANS.medium, fontSize: 12, lineHeight: 17 },
  /** Small-caps style kicker labels such as "ACCOMPLISHED" (sans). */
  overline: { fontFamily: SANS.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 0.9 },
  /** Navigation / chart labels (sans). */
  label: { fontFamily: SANS.semibold, fontSize: 12, lineHeight: 16 },
  timer: {
    fontFamily: SANS.bold,
    fontSize: 64,
    lineHeight: 78,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

/** Largest accessibility scaling per variant before text would overwhelm the layout. */
export const MAX_FONT_SCALE: Partial<Record<keyof typeof Type, number>> = {
  display: 1.4,
  title: 1.5,
  timer: 1.3,
  overline: 1.6,
};

/** Subject colours: distinct hues that stay readable as dots, bars and tints. */
export const SubjectColors = [
  '#5B5BD6', // indigo
  '#0B84C6', // ocean
  '#0F8A5F', // green
  '#C77700', // amber
  '#D13B3B', // red
  '#C2378A', // magenta
  '#7C4DDB', // violet
  '#0E8C8C', // teal
  '#E0601B', // orange
  '#5E6B7A', // slate
] as const;

/** A subject colour if it is a valid #RRGGBB hex, otherwise the theme's forest green. */
export function subjectColorOr(color: string | null | undefined, fallback: string): string {
  return typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : fallback;
}

/** Background tint for a subject colour (hex + alpha). */
export function tint(hex: string, alpha = 0.14): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/** Soft elevation; flatter in dark mode where shadows read as dirt. */
export function shadowFor(colors: ThemeColors, scheme: ThemeName): ViewStyle {
  const opacity = scheme === 'dark' ? 0.25 : 0.07;
  return Platform.select<ViewStyle>({
    web: {
      boxShadow:
        scheme === 'dark'
          ? '0 1px 2px rgba(0,0,0,0.3)'
          : '0 1px 2px rgba(59,47,30,0.06), 0 4px 16px rgba(59,47,30,0.05)',
    } as ViewStyle,
    default: {
      shadowColor: colors.shadow,
      shadowOpacity: opacity,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: scheme === 'dark' ? 0 : 2,
    },
  })!;
}
