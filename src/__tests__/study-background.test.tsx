import { AccessibilityInfo, Animated, AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { StudyBackground } from '@/components/study-background';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

const start = jest.fn();
const stop = jest.fn();

beforeEach(() => {
  mockFocused = true;
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  start.mockClear();
  stop.mockClear();
  jest.spyOn(Animated, 'loop').mockImplementation(() => ({ start, stop, reset: jest.fn() }) as never);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

async function renderScene(props: { kind: 'off' | 'rain' | 'bubbles' | 'leaves'; animate: boolean }) {
  const view = await render(<StudyBackground {...props} />);
  // Give the scene a size (layout) so particles are created.
  await act(async () => {
    fireEvent(screen.getByTestId('study-background', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } });
  });
  return view;
}

test('animates while the session is running', async () => {
  await renderScene({ kind: 'rain', animate: true });
  expect(start).toHaveBeenCalledTimes(1);
});

test('paused session: no motion (still frame)', async () => {
  await renderScene({ kind: 'bubbles', animate: false });
  expect(start).not.toHaveBeenCalled();
});

test('reduced motion: never animates', async () => {
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
  await renderScene({ kind: 'leaves', animate: true });
  expect(start).not.toHaveBeenCalled();
});

test('screen not focused: no animation work', async () => {
  mockFocused = false;
  await renderScene({ kind: 'rain', animate: true });
  expect(start).not.toHaveBeenCalled();
});

test('pausing stops the running loop', async () => {
  const view = await render(<StudyBackground kind="rain" animate />);
  await act(async () => {
    fireEvent(screen.getByTestId('study-background', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } });
  });
  expect(start).toHaveBeenCalledTimes(1);
  await view.rerender(<StudyBackground kind="rain" animate={false} />);
  expect(stop).toHaveBeenCalled();
});

test('"Off" renders nothing', async () => {
  const view = await render(<StudyBackground kind="off" animate />);
  expect(view.toJSON()).toBeNull();
});
