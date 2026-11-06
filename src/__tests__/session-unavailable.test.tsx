/**
 * Regression: B opens A's shared post, A switches it to "Only me". B must see
 * a friendly unavailable state with nothing of the post left on screen, and
 * "Go back" must return safely (to the previous screen, or to Feed when there
 * is no history), never dispatching an unhandled GO_BACK.
 */
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import SessionDetailScreen from '@/app/session/[id]/index';
import { fetchSessionCard } from '@/lib/api/sessions';
import { addComment, fetchComments } from '@/lib/api/social';
import { forgetSignedUrl } from '@/lib/api/storage';
import { onSessionUnavailable } from '@/lib/events';
import { __resetNavigationDebounce } from '@/lib/navigation';
import type { Comment, SessionCardData } from '@/lib/types';

jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true }));
jest.mock('@/providers/auth', () => {
  const profile = { id: 'user-b', username: 'bea', display_name: 'Bea', bio: null, avatar_path: null, created_at: '' };
  return { useMe: () => ({ userId: 'user-b', profile }), useAuth: () => ({ userId: 'user-b', profile }) };
});
jest.mock('@/providers/toast', () => {
  const toast = jest.fn();
  return { useToast: () => toast };
});
jest.mock('@/lib/api/sessions', () => ({ fetchSessionCard: jest.fn() }));
jest.mock('@/lib/api/social', () => ({
  fetchComments: jest.fn(),
  addComment: jest.fn(),
  deleteComment: jest.fn(),
  likeSession: jest.fn(),
  unlikeSession: jest.fn(),
}));
jest.mock('@/lib/api/buddies', () => ({
  fetchMyInvite: jest.fn(async () => null),
  removeBuddy: jest.fn(),
  respondToInvite: jest.fn(),
}));
jest.mock('@/lib/api/storage', () => ({
  getCachedSignedUrl: () => null,
  getSignedUrl: jest.fn(async () => 'https://storage.example/signed/photo.jpg'),
  forgetSignedUrl: jest.fn(),
}));

const PHOTO = 'user-a/s1/0f9e8d7c-0000-4000-8000-000000000000.jpg';
const sharedPost: SessionCardData = {
  id: 's1',
  user_id: 'user-a',
  subject_id: 'sub',
  subject_name: 'Calculus',
  subject_color: '#0F8A5F',
  goal_id: null,
  status: 'completed',
  timer_state: null,
  intention: 'Series',
  started_at: '2026-11-02T18:00:00.000Z',
  running_since: null,
  accumulated_ms: 1_800_000,
  ended_at: '2026-11-02T18:30:00.000Z',
  duration_seconds: 1800,
  completed_at: '2026-11-02T18:30:00.000Z',
  title: 'Taylor series drills',
  accomplishment: 'Finished problem set 4',
  mood: null,
  photo_path: PHOTO,
  song_title: null,
  song_artist: null,
  song_url: null,
  visibility: 'followers',
  like_count: 1,
  comment_count: 1,
  created_at: '2026-11-02T18:00:00.000Z',
  updated_at: '2026-11-02T18:30:00.000Z',
  author: { id: 'user-a', username: 'ada', display_name: 'Ada', avatar_path: null },
  liked_by_me: false,
  buddies: [],
};
const comment: Comment = {
  id: 'c1',
  session_id: 's1',
  user_id: 'user-c',
  body: 'Secret comment text',
  created_at: '2026-11-02T18:40:00.000Z',
  author: { id: 'user-c', username: 'cy', display_name: 'Cy', avatar_path: null },
};

const fetchCard = fetchSessionCard as jest.Mock;
const fetchCommentsMock = fetchComments as jest.Mock;

function FeedStub() {
  return (
    <Pressable onPress={() => router.push('/session/s1')}>
      <Text>Feed screen</Text>
    </Pressable>
  );
}

const routes = {
  index: FeedStub,
  feed: FeedStub,
  'session/[id]': SessionDetailScreen,
};

let consoleErrors: string[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  __resetNavigationDebounce();
  consoleErrors = [];
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    consoleErrors.push(args.map(String).join(' '));
  });
  fetchCard.mockResolvedValue(sharedPost);
  fetchCommentsMock.mockResolvedValue([comment]);
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

function unhandledGoBack() {
  return consoleErrors.filter((e) => e.includes('GO_BACK'));
}

async function pullToRefresh() {
  // The list's RefreshControl element carries the pull-to-refresh handler.
  const list = screen.getByTestId('session-detail-list');
  const onRefresh = (list.props.refreshControl as { props: { onRefresh: () => void } }).props.onRefresh;
  await act(async () => {
    onRefresh();
  });
}

test('post made private while open: details are cleared and "Go back" returns to the previous screen', async () => {
  const removed: string[] = [];
  const unsubscribe = onSessionUnavailable((id) => removed.push(id));
  await renderRouter(routes, { initialUrl: '/feed' });
  await fireEvent.press(await screen.findByText('Feed screen'));
  expect(await screen.findByText('Taylor series drills')).toBeTruthy();
  expect(screen.getByText('Secret comment text')).toBeTruthy();
  expect(screen).toHavePathname('/session/s1');

  // A switches the post to "Only me": RLS now returns no row for B.
  fetchCard.mockResolvedValue(null);
  await pullToRefresh();

  expect(await screen.findByText('This session is no longer available.')).toBeTruthy();
  expect(screen.queryByText('Taylor series drills')).toBeNull();
  expect(screen.queryByText('Secret comment text')).toBeNull();
  expect(screen.queryByText('Finished problem set 4')).toBeNull();
  // Comments are not requested for a session we can't see.
  expect(fetchCommentsMock).toHaveBeenCalledTimes(1);
  // The photo's signed URL is dropped and lists are told to remove the item.
  expect(forgetSignedUrl).toHaveBeenCalledWith('session-photos', PHOTO);
  expect(removed).toEqual(['s1']);

  await fireEvent.press(screen.getByText('Go back'));
  expect(screen).toHavePathname('/feed');
  expect(unhandledGoBack()).toEqual([]);
  unsubscribe();
});

test('opened directly from a link with no history: "Go back" replaces the route with Feed', async () => {
  fetchCard.mockResolvedValue(null);
  await renderRouter(routes, { initialUrl: '/session/s1' });
  expect(await screen.findByText('This session is no longer available.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Go back'));
  expect(screen).toHavePathname('/feed');
  expect(unhandledGoBack()).toEqual([]);
  // No retry loop: one request for the session, none for its comments.
  expect(fetchCard).toHaveBeenCalledTimes(1);
  expect(fetchCommentsMock).not.toHaveBeenCalled();
});

test('access revoked while open (e.g. unfollowed): a refused comment switches to the unavailable state', async () => {
  await renderRouter(routes, { initialUrl: '/session/s1' });
  expect(await screen.findByText('Taylor series drills')).toBeTruthy();

  fetchCard.mockResolvedValue(null);
  (addComment as jest.Mock).mockRejectedValue({ code: '42501', message: 'new row violates row-level security policy' });
  await fireEvent.changeText(screen.getByLabelText('Write a comment'), 'Nice!');
  await act(async () => {
    fireEvent.press(screen.getByText('Post'));
  });

  await waitFor(() => expect(screen.getByText('This session is no longer available.')).toBeTruthy());
  expect(screen.queryByText('Secret comment text')).toBeNull();
  expect(screen.queryByText(/Comment not posted/)).toBeNull();
});

test('deleted post: rapid double tap on "Go back" navigates only once', async () => {
  await renderRouter(routes, { initialUrl: '/feed' });
  await fireEvent.press(await screen.findByText('Feed screen'));
  await screen.findByText('Taylor series drills');
  fetchCard.mockResolvedValue(null);
  await pullToRefresh();
  const goBack = await screen.findByText('Go back');
  await fireEvent.press(goBack);
  await fireEvent.press(goBack);
  expect(screen).toHavePathname('/feed');
  expect(unhandledGoBack()).toEqual([]);
});
