/**
 * Optimistic like/unlike: the heart flips immediately, rolls back if the
 * server rejects, and repeated taps while a request is in flight are ignored
 * (the database's unique (session, user) key is the final guard).
 */
import { act, renderHook } from '@testing-library/react-native';

import { useLikeToggle } from '@/hooks/use-like-toggle';
import { likeSession, unlikeSession } from '@/lib/api/social';
import type { SessionCardData } from '@/lib/types';

jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: true }));
jest.mock('@/providers/auth', () => ({ useAuth: () => ({ userId: 'me' }) }));
const mockToast = jest.fn();
jest.mock('@/providers/toast', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/api/social', () => ({ likeSession: jest.fn(), unlikeSession: jest.fn() }));

function harness(initial: Pick<SessionCardData, 'id' | 'liked_by_me' | 'like_count'>) {
  let current = { ...initial } as SessionCardData;
  const updateItem = jest.fn((_id: string, patch: (s: SessionCardData) => SessionCardData) => {
    current = patch(current);
  });
  return { updateItem, get: () => current };
}

beforeEach(() => jest.clearAllMocks());

test('liking: optimistic fill, kept after success', async () => {
  (likeSession as jest.Mock).mockResolvedValue(undefined);
  const h = harness({ id: 's1', liked_by_me: false, like_count: 2 });
  const { result } = await renderHook(() => useLikeToggle(h.updateItem));
  await act(() => result.current(h.get()));
  expect(likeSession).toHaveBeenCalledWith('s1', 'me');
  expect(h.get()).toMatchObject({ liked_by_me: true, like_count: 3 });
});

test('a failed like rolls the heart and count back and explains', async () => {
  (likeSession as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
  const h = harness({ id: 's1', liked_by_me: false, like_count: 2 });
  const { result } = await renderHook(() => useLikeToggle(h.updateItem));
  await act(() => result.current(h.get()));
  expect(h.get()).toMatchObject({ liked_by_me: false, like_count: 2 });
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't like"), 'error');
});

test('a failed unlike restores the filled heart', async () => {
  (unlikeSession as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
  const h = harness({ id: 's1', liked_by_me: true, like_count: 1 });
  const { result } = await renderHook(() => useLikeToggle(h.updateItem));
  await act(() => result.current(h.get()));
  expect(h.get()).toMatchObject({ liked_by_me: true, like_count: 1 });
});

test('taps while a request is in flight are ignored (one request)', async () => {
  let resolve!: () => void;
  (likeSession as jest.Mock).mockImplementation(() => new Promise<void>((r) => (resolve = r)));
  const h = harness({ id: 's1', liked_by_me: false, like_count: 0 });
  const { result } = await renderHook(() => useLikeToggle(h.updateItem));
  let first!: Promise<void>;
  await act(async () => {
    first = result.current(h.get());
    await result.current(h.get());
    await result.current(h.get());
  });
  await act(async () => {
    resolve();
    await first;
  });
  expect(likeSession).toHaveBeenCalledTimes(1);
  expect(h.get()).toMatchObject({ liked_by_me: true, like_count: 1 });
});
