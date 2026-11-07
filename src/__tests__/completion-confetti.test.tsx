/**
 * Completion confetti (unchanged rules, new radial burst): it plays once per
 * session, only after the completion screen's save is CONFIRMED — for both
 * "Only me" and "Followers" — and never after a failed save, an edit of a
 * saved session, or reopening. Reduced motion gets a static success mark.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import SessionEditScreen from '@/app/session/[id]/edit';
import { fetchSessionCard, updateSessionDetails } from '@/lib/api/sessions';
import { __resetCelebrationMemory } from '@/lib/celebration';
import type { SessionCardData } from '@/lib/types';

jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true }));
jest.mock('@/providers/auth', () => {
  const profile = { id: 'me', username: 'me', display_name: 'Me', bio: null, avatar_path: null, created_at: '' };
  return { useMe: () => ({ userId: 'me', profile }), useAuth: () => ({ userId: 'me', profile }) };
});
jest.mock('@/providers/toast', () => ({ useToast: () => jest.fn() }));
jest.mock('@/lib/api/sessions', () => ({
  fetchSessionCard: jest.fn(),
  updateSessionDetails: jest.fn(),
  deleteSession: jest.fn(),
}));
jest.mock('@/lib/api/profiles', () => ({
  fetchSettings: jest.fn(async () => ({ user_id: 'me', remember_visibility: false, last_visibility: 'private' })),
  updateSettings: jest.fn(),
}));
jest.mock('@/lib/api/subjects', () => ({ fetchGoals: jest.fn(async () => []) }));
jest.mock('@/lib/api/buddies', () => ({
  fetchSessionInvites: jest.fn(async () => []),
  inviteBuddies: jest.fn(),
  removeBuddy: jest.fn(),
}));
jest.mock('@/lib/api/storage', () => ({
  getCachedSignedUrl: () => null,
  getSignedUrl: jest.fn(async () => null),
  pickSessionPhoto: jest.fn(),
  removeObject: jest.fn(),
  sessionPhotoPath: jest.fn(),
  uploadImage: jest.fn(),
}));

const session: SessionCardData = {
  id: 's1',
  user_id: 'me',
  subject_id: 'sub',
  subject_name: 'Calculus',
  subject_color: '#0F8A5F',
  goal_id: null,
  status: 'completed',
  timer_state: null,
  intention: null,
  started_at: '2026-11-02T18:00:00.000Z',
  running_since: null,
  accumulated_ms: 1_800_000,
  ended_at: '2026-11-02T18:30:00.000Z',
  duration_seconds: 1800,
  completed_at: '2026-11-02T18:30:00.000Z',
  title: null,
  accomplishment: null,
  mood: null,
  photo_path: null,
  song_title: null,
  song_artist: null,
  song_url: null,
  visibility: 'private',
  like_count: 0,
  comment_count: 0,
  created_at: '2026-11-02T18:00:00.000Z',
  updated_at: '2026-11-02T18:30:00.000Z',
  author: { id: 'me', username: 'me', display_name: 'Me', avatar_path: null },
  liked_by_me: false,
  buddies: [],
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  __resetCelebrationMemory();
  (fetchSessionCard as jest.Mock).mockResolvedValue(session);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

const open = async (url: string) => {
  const view = await renderRouter({ 'session/[id]/edit': SessionEditScreen }, { initialUrl: url });
  await screen.findByText(/Save privately|Save changes|Share with followers|Save & share/);
  return view;
};
const confettiShown = () => screen.queryByTestId('confetti', { includeHiddenElements: true }) !== null;

test('failed save: no confetti; the successful retry celebrates once', async () => {
  (updateSessionDetails as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
  await open('/session/s1/edit?fresh=1');
  await fireEvent.press(screen.getByLabelText('Save privately'));
  await screen.findByText(/Not saved/);
  expect(confettiShown()).toBe(false);

  (updateSessionDetails as jest.Mock).mockResolvedValueOnce(undefined);
  await fireEvent.press(screen.getByLabelText('Save privately'));
  await screen.findByText('Saved to your journal ✍️');
  expect(confettiShown()).toBe(true);
});

test('shared sessions celebrate too', async () => {
  (updateSessionDetails as jest.Mock).mockResolvedValue(undefined);
  await open('/session/s1/edit?fresh=1');
  await fireEvent.press(screen.getByLabelText(/^Followers\./));
  await fireEvent.press(screen.getByLabelText('Share with followers'));
  await screen.findByText('Shared with your followers! 🎉');
  expect(confettiShown()).toBe(true);
});

test('reopening the completion flow for the same session does not replay it', async () => {
  (updateSessionDetails as jest.Mock).mockResolvedValue(undefined);
  const first = await open('/session/s1/edit?fresh=1');
  await fireEvent.press(screen.getByLabelText('Save privately'));
  await screen.findByText('Saved to your journal ✍️');
  expect(confettiShown()).toBe(true);
  await first.unmount();

  // Reopened later (e.g. from a link): still the completion flow, already celebrated.
  await open('/session/s1/edit?fresh=1');
  await fireEvent.press(screen.getByLabelText('Save privately'));
  await screen.findByText('Saved to your journal ✍️');
  expect(confettiShown()).toBe(false);
});

test('editing an already-saved session never celebrates', async () => {
  (updateSessionDetails as jest.Mock).mockResolvedValue(undefined);
  await open('/session/s1/edit');
  await fireEvent.press(screen.getByLabelText('Save changes'));
  await screen.findByText('Changes saved');
  expect(confettiShown()).toBe(false);
});

test('reduced motion: a static success mark instead of the burst', async () => {
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
  (updateSessionDetails as jest.Mock).mockResolvedValue(undefined);
  await open('/session/s1/edit?fresh=1');
  await act(async () => undefined);
  await fireEvent.press(screen.getByLabelText('Save privately'));
  await screen.findByText('Saved to your journal ✍️');
  await waitFor(() => expect(screen.getByLabelText('Session saved')).toBeTruthy());
  expect(confettiShown()).toBe(false);
});
