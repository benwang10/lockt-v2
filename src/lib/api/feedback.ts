import { feedbackContext, type FeedbackCategory } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';

/**
 * Sends feedback through the submit_feedback RPC. The database stamps the
 * account and time; the client adds only app version and platform. Nothing
 * comes back: feedback can't be read through the API (not even your own).
 */
export async function submitFeedback(input: { category: FeedbackCategory; message: string }): Promise<void> {
  const { appVersion, platform } = feedbackContext();
  const { error } = await supabase.rpc('submit_feedback', {
    p_category: input.category,
    p_message: input.message.trim(),
    p_app_version: appVersion,
    p_platform: platform,
  });
  if (error) throw error;
}
