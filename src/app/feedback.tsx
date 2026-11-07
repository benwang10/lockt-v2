import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Banner, EmptyState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useSingleSubmit } from '@/hooks/use-single-submit';
import { submitFeedback } from '@/lib/api/feedback';
import { friendlyError } from '@/lib/errors';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_CHARS,
  feedbackContext,
  feedbackLength,
  validateFeedback,
  type FeedbackCategory,
} from '@/lib/feedback';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/providers/theme';

/**
 * Beta feedback: category + message, sent with app version and platform only.
 * On failure the text stays so the user can retry.
 */
export default function FeedbackScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const context = feedbackContext();
  const length = feedbackLength(message);
  const over = length > FEEDBACK_MAX_CHARS;

  const send = useSingleSubmit(async () => {
    const problem = validateFeedback({ category, message });
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitFeedback({ category, message });
      setSent(true);
    } catch (e) {
      setError(`Not sent: ${friendlyError(e)} Your message is still here.`);
    } finally {
      setSending(false);
    }
  });

  if (sent) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <EmptyState icon="checkCircle" title="Thanks for the feedback!" message="It went straight to the Lockt team.">
          <Button title="Done" onPress={() => goBackOr('/settings')} />
          <Button
            title="Send more"
            variant="secondary"
            onPress={() => {
              setMessage('');
              setSent(false);
            }}
          />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['bottom', 'left', 'right']}
      keyboardOffset={100}
      footer={<Button title="Send feedback" icon="send" size="lg" onPress={send} loading={sending} disabled={over} />}>
      <AppText variant="body" color={colors.textSecondary}>
        Found a bug or have an idea? Tell us what happened and what you expected. Only the Lockt team can read it.
      </AppText>

      {error ? <Banner tone="danger" message={error} /> : null}

      <Card>
        <AppText variant="heading" accessibilityRole="header">
          What kind of feedback?
        </AppText>
        <Segmented
          options={FEEDBACK_CATEGORIES.map((c) => ({ ...c, accessibilityLabel: `Category: ${c.label}` }))}
          value={category}
          onChange={setCategory}
        />
        <TextField
          label="Your feedback"
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder={
            category === 'bug'
              ? 'What did you do, what happened, and what did you expect?'
              : category === 'suggestion'
                ? 'What would make Lockt better for you?'
                : 'Anything you’d like to tell us'
          }
          maxLength={FEEDBACK_MAX_CHARS + 200}
          error={over ? `Keep it under ${FEEDBACK_MAX_CHARS.toLocaleString('en-US')} characters.` : null}
          style={styles.message}
        />
        <AppText
          variant="caption"
          color={over ? colors.danger : colors.textSecondary}
          style={styles.counter}
          accessibilityLabel={`${length} of ${FEEDBACK_MAX_CHARS} characters`}>
          {length}/{FEEDBACK_MAX_CHARS}
        </AppText>
      </Card>

      <View style={styles.note}>
        <AppText variant="caption" color={colors.textSecondary}>
          Sent with: Lockt {context.appVersion} · {context.platform}. Your account is attached so we can follow up; your
          study sessions, notes and photos are not.
        </AppText>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  message: { minHeight: 140 },
  counter: { alignSelf: 'flex-end', marginTop: -Spacing.sm },
  note: { paddingHorizontal: Spacing.xs },
}));
