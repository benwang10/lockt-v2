import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { useTheme } from '@/providers/theme';

/**
 * Quiet, embossed-looking study decals (book, pencil, paper, ruler, paper
 * clip, notebook) for the sign-up background.
 *
 * Each shape is drawn three times: a highlight offset up-left, a shadow
 * offset down-right, and the face in the background colour, which reads as a
 * shallow emboss on paper. Static vectors only — no animation, no images —
 * and the whole layer has pointerEvents="none" and is hidden from
 * accessibility, so it can never intercept touches or be read aloud.
 * Decals sit near the edges so text stays on plain background.
 */
type Decal = { d: string; x: number; y: number; scale: number; rotate: number };

const SHAPES = {
  // Closed book with a spine band (48 × 60 box).
  book: 'M8 2h32a4 4 0 0 1 4 4v48a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Zm4 0v56M18 14h18M18 20h12',
  // Pencil (horizontal, 72 × 14).
  pencil: 'M2 7 12 1h50a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H12L2 7Zm10-6v12m44-12v12',
  // Sheet of paper with a folded corner and lines (44 × 56).
  paper: 'M4 2h26l12 12v38a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm26 0v12h12M10 24h24M10 32h24M10 40h16',
  // Ruler (80 × 16) with ticks.
  ruler: 'M3 2h74a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 0v5m8-5v8m8-8v5m8-5v8m8-8v5m8-5v8m8-8v5m8-5v8',
  // Paper clip (20 × 52).
  clip: 'M14 14v24a6 6 0 0 1-12 0V10a8 8 0 0 1 16 0v30a10 10 0 0 1-20 0',
  // Spiral notebook (46 × 58).
  notebook: 'M8 4h34a2 2 0 0 1 2 2v46a2 2 0 0 1-2 2H8V4Zm-6 6h10M2 18h10M2 26h10M2 34h10M2 42h10M18 16h18',
} as const;

/** Positions as fractions of the screen so the layout adapts to phones and desktops. */
const LAYOUT: { shape: keyof typeof SHAPES; fx: number; fy: number; scale: number; rotate: number }[] = [
  // Top band, beside the logo.
  { shape: 'book', fx: 0.03, fy: 0.02, scale: 1.15, rotate: -12 },
  { shape: 'pencil', fx: 0.7, fy: 0.03, scale: 1.1, rotate: 18 },
  // Right edge, mostly behind the (opaque) inputs.
  { shape: 'paper', fx: 0.86, fy: 0.36, scale: 1.1, rotate: 10 },
  // Bottom band, below the button on phones.
  { shape: 'clip', fx: 0.1, fy: 0.75, scale: 1.1, rotate: -20 },
  { shape: 'pencil', fx: 0.72, fy: 0.78, scale: 0.9, rotate: -32 },
  { shape: 'notebook', fx: 0.24, fy: 0.85, scale: 1.15, rotate: 8 },
  { shape: 'ruler', fx: 0.55, fy: 0.92, scale: 1.2, rotate: -8 },
];

export function StudyDecals() {
  const { width, height } = useWindowDimensions();
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  // Emboss: light from the top-left.
  const highlight = dark ? 'rgba(255, 245, 225, 0.06)' : 'rgba(255, 255, 255, 0.95)';
  const shadow = dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(59, 47, 30, 0.10)';
  const face = dark ? 'rgba(255, 245, 225, 0.025)' : 'rgba(59, 47, 30, 0.018)';
  const decals: Decal[] = LAYOUT.map((l) => ({
    d: SHAPES[l.shape],
    x: l.fx * width,
    y: l.fy * height,
    scale: l.scale * (width < 380 ? 0.85 : 1),
    rotate: l.rotate,
  }));
  return (
    <View
      testID="study-decals"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden>
      <Svg width={width} height={height}>
        {decals.map((dec, i) => (
          <G key={i} transform={`translate(${dec.x} ${dec.y}) rotate(${dec.rotate}) scale(${dec.scale})`}>
            <Path d={dec.d} transform="translate(-1 -1)" fill="none" stroke={highlight} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={dec.d} transform="translate(1 1)" fill="none" stroke={shadow} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={dec.d} fill={face} stroke={face} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ))}
      </Svg>
    </View>
  );
}
