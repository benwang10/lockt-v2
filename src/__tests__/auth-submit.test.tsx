/**
 * Regression (web audit): pressing Enter twice in the password field (or
 * Enter + click) sent two sign-in requests, because the keyboard submit
 * didn't check the in-flight state. The same guard protects sign-up.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithPassword: jest.fn(), signUp: jest.fn() } },
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
  const { Text } = require('react-native');
  return { Link: ({ children }: { children: unknown }) => <Text>{children as string}</Text>, router: { replace: jest.fn() } };
});
jest.mock('expo-linking', () => ({ createURL: (p: string) => `studylog://${p}` }));

beforeEach(() => jest.clearAllMocks());

test('sign-in: repeated Enter while the request is pending sends exactly one request', async () => {
  let resolve!: (v: unknown) => void;
  (supabase.auth.signInWithPassword as jest.Mock).mockImplementation(() => new Promise((r) => (resolve = r)));
  await render(<SignInScreen />);
  await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
  // Three keyboard submits in the same frame while the first request is still pending.
  const password = screen.getByLabelText('Password');
  await act(() => {
    password.props.onSubmitEditing();
    password.props.onSubmitEditing();
    password.props.onSubmitEditing();
  });
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ error: { message: 'Invalid login credentials' } }));
  expect(screen.getByText('That email and password don’t match.')).toBeTruthy();
  // After it settles, a retry is possible (the button isn't stuck).
  (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });
  await act(async () => {
    await screen.getByLabelText('Password').props.onSubmitEditing();
  });
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(2);
});

test('sign-up: repeated Enter creates one account request', async () => {
  let resolve!: (v: unknown) => void;
  (supabase.auth.signUp as jest.Mock).mockImplementation(() => new Promise((r) => (resolve = r)));
  await render(<SignUpScreen />);
  await fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'longenough1');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'longenough1');
  const confirm = screen.getByLabelText('Confirm password');
  await act(() => {
    confirm.props.onSubmitEditing();
    confirm.props.onSubmitEditing();
  });
  expect(supabase.auth.signUp).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ data: { session: null }, error: null }));
  expect(screen.getByText('Check your inbox')).toBeTruthy();
});
