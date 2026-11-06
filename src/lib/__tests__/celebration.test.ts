import AsyncStorage from '@react-native-async-storage/async-storage';

import { __resetCelebrationMemory, claimCelebration } from '../celebration';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetCelebrationMemory();
});

describe('confetti: successful save only, once per session', () => {
  test('a failed save never celebrates', async () => {
    expect(await claimCelebration('s1', { completionFlow: true, saved: false })).toBe(false);
    // …and does not use up the celebration for the retry that succeeds.
    expect(await claimCelebration('s1', { completionFlow: true, saved: true })).toBe(true);
  });

  test('celebrates once for both Followers and Only me saves, never twice', async () => {
    expect(await claimCelebration('shared', { completionFlow: true, saved: true })).toBe(true);
    expect(await claimCelebration('private', { completionFlow: true, saved: true })).toBe(true);
    expect(await claimCelebration('shared', { completionFlow: true, saved: true })).toBe(false);
    expect(await claimCelebration('private', { completionFlow: true, saved: true })).toBe(false);
  });

  test('edits, visibility changes and reopening outside the completion flow never celebrate', async () => {
    expect(await claimCelebration('s2', { completionFlow: false, saved: true })).toBe(false);
  });

  test('concurrent claims (double tap) celebrate once', async () => {
    const results = await Promise.all([
      claimCelebration('s3', { completionFlow: true, saved: true }),
      claimCelebration('s3', { completionFlow: true, saved: true }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test('remembered across app restarts', async () => {
    expect(await claimCelebration('s4', { completionFlow: true, saved: true })).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    __resetCelebrationMemory(); // simulate a cold start
    expect(await claimCelebration('s4', { completionFlow: true, saved: true })).toBe(false);
  });
});
