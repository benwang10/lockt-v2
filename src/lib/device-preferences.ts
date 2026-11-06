import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small, typed device-level preferences (not synced to the account):
 * appearance and the study-screen background. Unknown or corrupt stored
 * values fall back to the default, so a bad write can never break launch.
 */
export type DevicePreference<T extends string> = {
  key: string;
  values: readonly T[];
  fallback: T;
};

export const APPEARANCE_PREFERENCE: DevicePreference<'system' | 'light' | 'dark'> = {
  key: 'studylog.appearance.v1',
  values: ['system', 'light', 'dark'],
  fallback: 'system',
};

export const STUDY_BACKGROUND_PREFERENCE: DevicePreference<'off' | 'rain' | 'bubbles' | 'leaves'> = {
  key: 'studylog.studyBackground.v1',
  values: ['off', 'rain', 'bubbles', 'leaves'],
  fallback: 'off',
};

export function parsePreference<T extends string>(pref: DevicePreference<T>, raw: string | null | undefined): T {
  return raw && (pref.values as readonly string[]).includes(raw) ? (raw as T) : pref.fallback;
}

export async function loadPreference<T extends string>(pref: DevicePreference<T>): Promise<T> {
  try {
    return parsePreference(pref, await AsyncStorage.getItem(pref.key));
  } catch {
    return pref.fallback;
  }
}

export async function savePreference<T extends string>(pref: DevicePreference<T>, value: T): Promise<void> {
  if (!(pref.values as readonly string[]).includes(value)) throw new Error(`Invalid value for ${pref.key}`);
  await AsyncStorage.setItem(pref.key, value);
}
