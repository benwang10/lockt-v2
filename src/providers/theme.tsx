import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme } from 'react-native';

import { Palettes, shadowFor, type ThemeColors, type ThemeName } from '@/constants/theme';
import { APPEARANCE_PREFERENCE, loadPreference, savePreference } from '@/lib/device-preferences';

export type AppearancePreference = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  /** Resolved scheme actually shown. */
  scheme: ThemeName;
  colors: ThemeColors;
  preference: AppearancePreference;
  setPreference: (next: AppearancePreference) => void;
  /** The stored preference has been read (avoids a flash of the wrong theme). */
  ready: boolean;
};

const fallback: ThemeContextValue = {
  scheme: 'light',
  colors: Palettes.light,
  preference: 'system',
  setPreference: () => undefined,
  ready: true,
};

const ThemeContext = createContext<ThemeContextValue>(fallback);

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Resolves the scheme to show for a preference and the system's current scheme. */
export function resolveScheme(preference: AppearancePreference, system: string | null | undefined): ThemeName {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/**
 * Appearance: System (default) / Light / Dark, persisted per device.
 * Lives above navigation and the active-session provider, so switching only
 * re-renders styles; it never remounts screens or touches the study timer.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');
  const [ready, setReady] = useState(false);
  const system = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    loadPreference(APPEARANCE_PREFERENCE).then((p) => {
      if (cancelled) return;
      setPreferenceState(p);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Native controls (alerts, switches, keyboard) follow the chosen scheme too.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
    } catch {
      // Older runtimes without overrides simply follow the system.
    }
  }, [preference]);

  const setPreference = useCallback((next: AppearancePreference) => {
    setPreferenceState(next);
    savePreference(APPEARANCE_PREFERENCE, next).catch(() => undefined);
  }, []);

  const scheme = resolveScheme(preference, system);
  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, colors: Palettes[scheme], preference, setPreference, ready }),
    [scheme, preference, setPreference, ready],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Same constraint StyleSheet.create uses (RN's internal style map type). */
type StyleShape = Parameters<typeof StyleSheet.create>[0];

type Helpers = { scheme: ThemeName; shadow: ReturnType<typeof shadowFor> };

/**
 * Theme-aware StyleSheet: the factory runs once per scheme and is cached, so
 * components get stable style objects and re-render only when the theme changes.
 */
export function makeStyles<T extends StyleShape>(factory: (colors: ThemeColors, helpers: Helpers) => T & StyleShape) {
  const cache: Partial<Record<ThemeName, Readonly<T>>> = {};
  return function useStyles(): Readonly<T> {
    const { scheme } = useContext(ThemeContext);
    let styles = cache[scheme];
    if (!styles) {
      const colors = Palettes[scheme];
      styles = StyleSheet.create(factory(colors, { scheme, shadow: shadowFor(colors, scheme) }));
      cache[scheme] = styles;
    }
    return styles;
  };
}
