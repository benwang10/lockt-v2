import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type FeedbackCategory = 'bug' | 'suggestion' | 'other';

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

/** Must match the database check on public.feedback.message. */
export const FEEDBACK_MAX_CHARS = 2000;

export function feedbackLength(text: string): number {
  return Array.from(text.trim()).length;
}

export function validateFeedback(input: { category: FeedbackCategory | null; message: string }): string | null {
  if (!input.category) return 'Choose Bug, Suggestion or Other.';
  const n = feedbackLength(input.message);
  if (n === 0) return 'Write a few words first.';
  if (n > FEEDBACK_MAX_CHARS) return `Keep it under ${FEEDBACK_MAX_CHARS.toLocaleString('en-US')} characters.`;
  return null;
}

/** The only context attached to feedback: app version and platform. */
export function feedbackContext(): { appVersion: string; platform: 'ios' | 'android' | 'web' | 'other' } {
  const version = Constants.expoConfig?.version ?? 'unknown';
  const os = Platform.OS;
  return { appVersion: version, platform: os === 'ios' || os === 'android' || os === 'web' ? os : 'other' };
}
