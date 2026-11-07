import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Banner, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useSingleSubmit } from '@/hooks/use-single-submit';
import { checkedA11y, webSpaceActivates } from '@/lib/a11y';
import { clearStatus, fetchStatus, saveStatus } from '@/lib/api/statuses';
import { readEmojiInput } from '@/lib/emoji';
import { friendlyError } from '@/lib/errors';
import { invalidate } from '@/lib/events';
import { goBackOr } from '@/lib/navigation';
import { formatStatusExpiry, STATUS_EMOJI, STATUS_LIFETIME_HOURS, STATUS_MAX_CHARS, statusLength, validateStatus } from '@/lib/status';
import type { ProfileStatus } from '@/lib/types';
import { useMe } from '@/providers/auth';
import { makeStyles, useTheme } from '@/providers/theme';

/**
 * Create, edit or clear your short note (followers only, 24 h). Notes are
 * shown live at the top of Feed; this editor has no separate preview.
 * The route is `/note` (Metro's dev server reserves `/status`).
 */
export default function NoteScreen() {
  const { userId } = useMe();
  const query = useQuery(() => fetchStatus(userId), [userId]);
  if (query.loading) return <LoadingState />;
  if (query.error && query.data === undefined) return <ErrorState message={query.error} onRetry={query.reload} />;
  return <NoteEditor current={query.data ?? null} />;
}

const DESKTOP_HINT =
  Platform.OS === 'web' ? ' On a computer, press Windows + . (Windows) or Control + Command + Space (Mac).' : '';

function NoteEditor({ current }: { current: ProfileStatus | null }) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const [emoji, setEmoji] = useState<string | null>(current?.emoji ?? null);
  const [emojiHint, setEmojiHint] = useState<string | null>(null);
  const [body, setBody] = useState(current?.body ?? '');
  const [busy, setBusy] = useState<null | 'save' | 'clear'>(null);
  const [error, setError] = useState<string | null>(null);
  const length = statusLength(body.trim());
  const over = length > STATUS_MAX_CHARS;

  const done = () => {
    invalidate('status');
    goBackOr('/feed');
  };

  const onEmojiText = (text: string) => {
    const result = readEmojiInput(text);
    // Letters typed into the emoji box are ignored; the current emoji stays.
    setEmoji(result.emoji ?? (result.hadOtherText ? emoji : null));
    setEmojiHint(
      result.unsupported
        ? 'That emoji can’t be used in a note. Try another one.'
        : result.hadOtherText
          ? 'Only an emoji goes here. Write words in the note below.'
          : null,
    );
  };

  const save = useSingleSubmit(async () => {
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
  });

  const clear = useSingleSubmit(async () => {
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
  });

  return (
    <Screen
      scroll
      edges={['bottom', 'left', 'right']}
      keyboardOffset={100}
      footer={<Button title="Share note" icon="send" size="lg" onPress={save} loading={busy === 'save'} disabled={over || !!busy} />}>
      <AppText variant="body" color={colors.textSecondary}>
        A short note for the people who follow you, shown at the top of their Feed. It disappears{' '}
        {STATUS_LIFETIME_HOURS} hours after you last save it.
      </AppText>

      {error ? <Banner tone="danger" message={error} /> : null}

      <Card>
        <AppText variant="heading" nativeID="note-emoji-label">
          Emoji (optional)
        </AppText>
        <View style={styles.emojiRow}>
          <TextInput
            testID="note-emoji-input"
            value={emoji ?? ''}
            onChangeText={onEmojiText}
            accessibilityLabel="Emoji for your note"
            accessibilityHint="Type or paste any emoji"
            placeholder="＋"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={scheme}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            // iOS opens the emoji keyboard when the user switches to it; "default" keeps it available.
            keyboardType="default"
            returnKeyType="done"
            selectionColor={colors.accent}
            style={[styles.emojiInput, emoji ? styles.emojiInputFilled : null]}
          />
          <View style={styles.flex}>
            <AppText variant="small" color={colors.textSecondary}>
              Tap the box and choose any emoji from your keyboard.{DESKTOP_HINT}
            </AppText>
            {emoji ? (
              <Button
                title="Remove emoji"
                variant="ghost"
                size="sm"
                icon="close"
                onPress={() => {
                  setEmoji(null);
                  setEmojiHint(null);
                }}
                style={styles.alignStart}
              />
            ) : null}
          </View>
        </View>
        {emojiHint ? (
          <AppText variant="caption" color={colors.warning} accessibilityLiveRegion="polite">
            {emojiHint}
          </AppText>
        ) : null}
        <AppText variant="smallStrong" color={colors.textSecondary}>
          Quick picks
        </AppText>
        <View style={styles.emojiGrid} accessibilityRole="radiogroup" accessibilityLabel="Quick emoji picks">
          {STATUS_EMOJI.map((e) => {
            const selected = emoji === e;
            const pick = () => {
              setEmoji(selected ? null : e);
              setEmojiHint(null);
            };
            return (
              <Pressable
                key={e}
                onPress={pick}
                accessibilityRole="radio"
                {...checkedA11y(selected)}
                {...webSpaceActivates(pick)}
                accessibilityLabel={`Emoji ${e}`}
                style={({ pressed }) => [styles.emoji, selected && styles.emojiSelected, pressed && !selected && styles.emojiPressed]}>
                <AppText style={styles.emojiText}>{e}</AppText>
              </Pressable>
            );
          })}
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
          hint={
            current
              ? `${formatStatusExpiry(current.expires_at)} · saving restarts the ${STATUS_LIFETIME_HOURS} h`
              : `Visible for ${STATUS_LIFETIME_HOURS} h`
          }
        />
        <AppText
          variant="caption"
          color={over ? colors.danger : length >= STATUS_MAX_CHARS * 0.9 ? colors.warning : colors.textSecondary}
          style={styles.counter}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${length} of ${STATUS_MAX_CHARS} characters`}>
          {length}/{STATUS_MAX_CHARS}
        </AppText>
      </Card>

      {current ? (
        <Button title="Clear note" variant="dangerGhost" icon="trash" onPress={clear} loading={busy === 'clear'} disabled={!!busy} />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  emojiRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  emojiInput: {
    width: 72,
    height: 72,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    textAlign: 'center',
    fontSize: 34,
    color: c.text,
    padding: 0,
  },
  emojiInputFilled: { borderStyle: 'solid', borderColor: c.accent, backgroundColor: c.accentSoft },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  emoji: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceMuted,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiSelected: { borderColor: c.accent, backgroundColor: c.accentSoft },
  emojiPressed: { opacity: 0.7 },
  emojiText: { fontSize: 24, lineHeight: 32 },
  counter: { alignSelf: 'flex-end', marginTop: -Spacing.sm },
  alignStart: { alignSelf: 'flex-start', marginLeft: -Spacing.md },
  flex: { flex: 1, gap: Spacing.xs },
}));
