/**
 * Hold to finish: a session finishes only after an uninterrupted 3-second
 * hold, measured in elapsed time, and exactly once.
 */
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { HOLD_TO_FINISH_MS, HoldButton } from '@/components/hold-button';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

let appStateListener: ((s: AppStateStatus) => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  appStateListener = null;
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function setup(props: Partial<Parameters<typeof HoldButton>[0]> = {}) {
  const onComplete = jest.fn();
  const view = await render(<HoldButton title="Hold to finish" onComplete={onComplete} {...props} />);
  const button = screen.getByLabelText('Hold to finish');
  return { onComplete, button, view };
}

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

test('is labelled and explains the hold requirement', async () => {
  const { button } = await setup();
  expect(button.props.accessibilityHint).toMatch(/hold for 3 seconds/i);
  expect(HOLD_TO_FINISH_MS).toBe(3000);
});

test('a quick tap never finishes, and explains what to do', async () => {
  const { onComplete, button } = await setup();
  await fireEvent(button, 'pressIn');
  await advance(150);
  await fireEvent(button, 'pressOut');
  // The explanation replaces the label inside the button (no layout shift)…
  expect(screen.getByText('Hold for 3 seconds to finish')).toBeTruthy();
  await advance(5000);
  expect(onComplete).not.toHaveBeenCalled();
  // …and the normal label comes back.
  expect(screen.getByText('Hold to finish')).toBeTruthy();
});

test('an uninterrupted 3-second hold finishes exactly once', async () => {
  const { onComplete, button } = await setup();
  await fireEvent(button, 'pressIn');
  expect(screen.getByText('Keep holding…')).toBeTruthy();
  await advance(2999);
  expect(onComplete).not.toHaveBeenCalled();
  await advance(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  // Still holding after completion: nothing more happens.
  await advance(5000);
  await fireEvent(button, 'pressOut');
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('releasing early cancels and resets progress (a new hold starts from zero)', async () => {
  const { onComplete, button } = await setup();
  await fireEvent(button, 'pressIn');
  await advance(2500);
  await fireEvent(button, 'pressOut');
  await advance(1000);
  expect(onComplete).not.toHaveBeenCalled();
  await fireEvent(button, 'pressIn');
  await advance(2500); // 2.5 s into the NEW hold: not done
  expect(onComplete).not.toHaveBeenCalled();
  await advance(500);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('repeated press-in events while holding do not restart or duplicate', async () => {
  const { onComplete, button } = await setup();
  await fireEvent(button, 'pressIn');
  await advance(1000);
  await fireEvent(button, 'pressIn');
  await fireEvent(button, 'pressIn');
  await advance(2000);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('uses elapsed time: a late timer cannot make the hold shorter or longer', async () => {
  const { onComplete, button } = await setup();
  const start = Date.now();
  await fireEvent(button, 'pressIn');
  await advance(3000);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(Date.now() - start).toBeGreaterThanOrEqual(3000);
});

test('the app going to the background cancels; resuming does not complete the old hold', async () => {
  const { onComplete, button } = await setup();
  await fireEvent(button, 'pressIn');
  await advance(2000);
  await act(() => appStateListener?.('background'));
  await advance(5000);
  await act(() => appStateListener?.('active'));
  await advance(5000);
  expect(onComplete).not.toHaveBeenCalled();
});

test('losing focus (blur) cancels', async () => {
  const { onComplete, button } = await setup();
  await fireEvent(button, 'pressIn');
  await advance(2000);
  await fireEvent(button, 'blur');
  await advance(2000);
  expect(onComplete).not.toHaveBeenCalled();
});

test('leaving the screen cancels', async () => {
  const { onComplete, button, view } = await setup();
  await fireEvent(button, 'pressIn');
  await advance(2000);
  mockFocused = false;
  await view.rerender(<HoldButton title="Hold to finish" onComplete={onComplete} />);
  await advance(3000);
  expect(onComplete).not.toHaveBeenCalled();
});

test('unmounting mid-hold never completes later', async () => {
  const { onComplete, button, view } = await setup();
  await fireEvent(button, 'pressIn');
  await advance(1000);
  await view.unmount();
  await advance(5000);
  expect(onComplete).not.toHaveBeenCalled();
});

test('disabled or busy: holding does nothing (e.g. while a pause is being saved)', async () => {
  const { onComplete, button } = await setup({ disabled: true });
  await fireEvent(button, 'pressIn');
  await advance(4000);
  expect(onComplete).not.toHaveBeenCalled();
});

test('becoming busy mid-hold cancels', async () => {
  const { onComplete, button, view } = await setup();
  await fireEvent(button, 'pressIn');
  await advance(1500);
  await view.rerender(<HoldButton title="Hold to finish" onComplete={onComplete} loading />);
  await advance(3000);
  expect(onComplete).not.toHaveBeenCalled();
});
