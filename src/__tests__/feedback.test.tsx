/**
 * Beta feedback form: category + message, clear validation, a failure keeps
 * the text for a retry, success thanks the user. Only app version and
 * platform are attached.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import FeedbackScreen from '@/app/feedback';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '2.5.0' } }));

const rpc = supabase.rpc as jest.Mock;
beforeEach(() => rpc.mockReset());

test('empty feedback is caught before sending', async () => {
  await render(<FeedbackScreen />);
  await fireEvent.press(screen.getByLabelText('Send feedback'));
  expect(rpc).not.toHaveBeenCalled();
  expect(screen.getByText('Write a few words first.')).toBeTruthy();
});

test('sends category, trimmed text, version and platform — nothing else', async () => {
  rpc.mockResolvedValue({ error: null });
  await render(<FeedbackScreen />);
  await fireEvent.press(screen.getByLabelText('Category: Suggestion'));
  await fireEvent.changeText(screen.getByLabelText('Your feedback'), '  Dark mode timer is great  ');
  await fireEvent.press(screen.getByLabelText('Send feedback'));
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('submit_feedback', {
    p_category: 'suggestion',
    p_message: 'Dark mode timer is great',
    p_app_version: '2.5.0',
    p_platform: 'ios',
  });
  expect(await screen.findByText('Thanks for the feedback!')).toBeTruthy();
});

test('a failure explains itself and keeps the message for a retry', async () => {
  rpc.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
  await render(<FeedbackScreen />);
  await fireEvent.changeText(screen.getByLabelText('Your feedback'), 'Photos fail to upload');
  await fireEvent.press(screen.getByLabelText('Send feedback'));
  expect(await screen.findByText(/Not sent: Can't reach the server/)).toBeTruthy();
  expect(screen.getByLabelText('Your feedback').props.value).toBe('Photos fail to upload');
  rpc.mockResolvedValueOnce({ error: null });
  await fireEvent.press(screen.getByLabelText('Send feedback'));
  expect(await screen.findByText('Thanks for the feedback!')).toBeTruthy();
});

test('the server’s rate limit is explained', async () => {
  rpc.mockResolvedValueOnce({ error: { message: 'feedback_rate_limited', code: '54000' } });
  await render(<FeedbackScreen />);
  await fireEvent.changeText(screen.getByLabelText('Your feedback'), 'again');
  await fireEvent.press(screen.getByLabelText('Send feedback'));
  expect(await screen.findByText(/sent a lot of feedback/)).toBeTruthy();
});
