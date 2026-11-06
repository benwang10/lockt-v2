import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Banner, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { clearStatus, fetchStatus, saveStatus } from '@/lib/api/statuses';
import { friendlyError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import { goBackOr } from '@/lib/navigation';
import { formatStatusExpiry, STATUS_EMOJI, STATUS_LIFETIME_HOURS, STATUS_MAX_CHARS, statusLength, validateStatus } from '@/lib/status';
import type { ProfileStatus } from '@/lib/types';
import { useMe } from '@/providers/auth';
import { makeStyles, useTheme } from '@/providers/theme';

/** Create, edit or clear your short profile note (followers only, 24 h). */
export default function StatusScreen() {
  const { userId } = useMe();
  const query = useQuery(() => fetchStatus(userId), [userId]);
  if (query.loading) return <LoadingState />;
  if (query.error && query.data === undefined) return <ErrorState message={query.error} onRetry={query.reload} />;
  return <StatusEditor current={query.data ?? null} />;
}

function StatusEditor({ current }: { current: ProfileStatus | null }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [emoji, setEmoji] = useState<string | null>(current?.emoji ?? null);
  const [body, setBody] = useState(current?.body ?? '');
  const [busy, setBusy] = useState<null | 'save' | 'clear'>(null);
  const [error, setError] = useState<string | null>(null);
  const length = statusLength(body.trim());
  const over = length > STATUS_MAX_CHARS;

  const done = () => {
    invalidate('status');
    goBackOr('/profile');
  };

  const save = async () => {
    const problem = validateStatus({ emoji, body });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await saveStatus({ emoji, body: body.trim() || null });
      done();
    } catch (e) {
      setError(`Not saved: ${friendlyError(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy('clear');
    setError(null);
    try {
      await clearStatus();
      done();
    } catch (e) {
      setError(`Couldn’t clear it: ${friendlyError(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      scroll
      edges={['bottom', 'left', 'right']}
      keyboardOffset={100}
      footer={<Button title="Share note" icon="send" size="lg" onPress={save} loading={busy === 'save'} disabled={over || !!busy} />}>
      <AppText variant="body" color={colors.textSecondary}>
        A short note for the people who follow you. It disappears {STATUS_LIFETIME_HOURS} hours after you last save it.
      </AppText>

      {error ? <Banner tone="danger" message={error} /> : null}

      <Card>
        <AppText variant="heading">Emoji (optional)</AppText>
        <View style={styles.emojiGrid} accessibilityRole="radiogroup" accessibilityLabel="Emoji">
          <Pressable
            onPress={() => setEmoji(null)}
            accessibilityRole="radio"
            accessibilityState={{ selected: emoji === null }}
            accessibilityLabel="No emoji"
            style={[styles.emoji, emoji === null && styles.emojiSelected]}>
            <AppText variant="label" color={colors.textSecondary}>
              None
            </AppText>
          </Pressable>
          {STATUS_EMOJI.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEmoji(e)}
              accessibilityRole="radio"
              accessibilityState={{ selected: emoji === e }}
              accessibilityLabel={`Emoji ${e}`}
              style={[styles.emoji, emoji === e && styles.emojiSelected]}>
              <AppText style={styles.emojiText}>{e}</AppText>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <TextField
          label="Note"
          value={body}
          onChangeText={setBody}
          placeholder="e.g. Library 3rd floor until 6, come say hi"
          multiline
          // Room to paste and trim; the counter and the server enforce 100.
          maxLength={STATUS_MAX_CHARS * 2}
          error={over ? `Keep it to ${STATUS_MAX_CHARS} characters.` : null}
          hint={current ? `${formatStatusExpiry(current.expires_at)} · saving restarts the ${STATUS_LIFETIME_HOURS} h` : `Visible for ${STATUS_LIFETIME_HOURS} h`}
        />
        <AppText
          variant="caption"
          color={over ? colors.danger : length >= STATUS_MAX_CHARS * 0.9 ? colors.warning : colors.textSecondary}
          style={styles.counter}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${length} of ${STATUS_MAX_CHARS} characters`}>
          {length}/{STATUS_MAX_CHARS}
        </AppText>
        <View style={styles.preview}>
          {emoji ? <AppText style={styles.emojiText}>{emoji}</AppText> : null}
          <AppText variant="body" style={styles.flex} color={body.trim() ? colors.text : colors.textMuted}>
            {body.trim() || 'Your note preview'}
          </AppText>
        </View>
      </Card>

      {current ? (
        <Button title="Clear note" variant="dangerGhost" icon="trash" onPress={clear} loading={busy === 'clear'} disabled={!!busy} />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  emoji: {
    minWidth: 48,
    height: 48,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceMuted,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiSelected: { borderColor: c.accent, backgroundColor: c.accentSoft },
  emojiText: { fontSize: 24, lineHeight: 32 },
  counter: { alignSelf: 'flex-end', marginTop: -Spacing.sm },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.surfaceMuted,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  flex: { flex: 1 },
}));
