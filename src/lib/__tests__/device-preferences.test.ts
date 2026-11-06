import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  APPEARANCE_PREFERENCE,
  loadPreference,
  parsePreference,
  savePreference,
  STUDY_BACKGROUND_PREFERENCE,
} from '../device-preferences';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(() => AsyncStorage.clear());

describe('device preferences (appearance, study background)', () => {
  test('defaults: appearance follows the system, background is off', async () => {
    expect(await loadPreference(APPEARANCE_PREFERENCE)).toBe('system');
    expect(await loadPreference(STUDY_BACKGROUND_PREFERENCE)).toBe('off');
  });

  test('an explicit choice persists and is read back', async () => {
    await savePreference(APPEARANCE_PREFERENCE, 'dark');
    await savePreference(STUDY_BACKGROUND_PREFERENCE, 'rain');
    expect(await loadPreference(APPEARANCE_PREFERENCE)).toBe('dark');
    expect(await loadPreference(STUDY_BACKGROUND_PREFERENCE)).toBe('rain');
    expect(await AsyncStorage.getItem('studylog.appearance.v1')).toBe('dark');
  });

  test('corrupt or unknown stored values fall back to the default', async () => {
    await AsyncStorage.setItem('studylog.studyBackground.v1', 'lava-lamp');
    expect(await loadPreference(STUDY_BACKGROUND_PREFERENCE)).toBe('off');
    expect(parsePreference(APPEARANCE_PREFERENCE, null)).toBe('system');
    await expect(savePreference(APPEARANCE_PREFERENCE, 'neon' as never)).rejects.toThrow();
  });

  test('storage failures never break launch', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk full'));
    expect(await loadPreference(APPEARANCE_PREFERENCE)).toBe('system');
  });
});
