/**
 * Typography families, configured in ONE place.
 *
 * Default serif: Source Serif 4 (SIL Open Font License 1.1, see
 * assets/fonts/source-serif-4/OFL.txt). Lockt's preferred face is Tiempos
 * Text; it is commercially licensed and no font files were supplied, so it is
 * not bundled. To switch later, add the licensed .ttf/.otf files under
 * assets/fonts/tiempos/ and point SERIF below at them (keep the keys).
 *
 * Complementary sans: Inter (SIL OFL 1.1, assets/fonts/inter/OFL.txt), used
 * sparingly for navigation labels, compact metadata, chart labels and timer
 * numerals.
 *
 * Every weight is registered as its own family name and only weights that
 * are actually bundled are referenced. Styles never combine a custom family
 * with `fontWeight` (Android would otherwise fall back to a synthetic face).
 */

export const FONT_ASSETS = {
  'SourceSerif4-Regular': require('../../assets/fonts/source-serif-4/SourceSerif4_400Regular.ttf'),
  'SourceSerif4-Italic': require('../../assets/fonts/source-serif-4/SourceSerif4_400Regular_Italic.ttf'),
  'SourceSerif4-SemiBold': require('../../assets/fonts/source-serif-4/SourceSerif4_600SemiBold.ttf'),
  'SourceSerif4-Bold': require('../../assets/fonts/source-serif-4/SourceSerif4_700Bold.ttf'),
  'Inter-Medium': require('../../assets/fonts/inter/Inter_500Medium.ttf'),
  'Inter-SemiBold': require('../../assets/fonts/inter/Inter_600SemiBold.ttf'),
  'Inter-Bold': require('../../assets/fonts/inter/Inter_700Bold.ttf'),
} as const;

type FamilyName = keyof typeof FONT_ASSETS;

export const SERIF: { regular: FamilyName; italic: FamilyName; semibold: FamilyName; bold: FamilyName } = {
  regular: 'SourceSerif4-Regular',
  italic: 'SourceSerif4-Italic',
  semibold: 'SourceSerif4-SemiBold',
  bold: 'SourceSerif4-Bold',
};

export const SANS: { medium: FamilyName; semibold: FamilyName; bold: FamilyName } = {
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
};
