import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { MAX_CONTENT_WIDTH, Radius, Spacing } from '@/constants/theme';
import { formatStatusExpiry } from '@/lib/status';
import { formatRelativeTime } from '@/lib/time';
import type { NoteWithAuthor, Profile } from '@/lib/types';
import { makeStyles, useTheme } from '@/providers/theme';

const BUBBLE_WIDTH = 92;

/**
 * Compact horizontal "Notes" strip for the top of Feed: my note (or an add
 * button) first, then notes from people I follow. Kept short so session
 * cards stay the main content. Tapping opens the full note.
 */
export function NotesRow({ me, notes }: { me: Profile; notes: NoteWithAuthor[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState<NoteWithAuthor | null>(null);
  const mine = notes.find((n) => n.user_id === me.id) ?? null;
  const others = notes.filter((n) => n.user_id !== me.id);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel="Notes from you and people you follow">
        {mine ? (
          <NoteBubble note={mine} label="Your note" onPress={() => setOpen(mine)} />
        ) : (
          <Pressable
            onPress={() => router.push('/note')}
            accessibilityRole="button"
            accessibilityLabel="Add a note for your followers"
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
            <View style={[styles.bubble, styles.addBubble]}>
              <Icon name="plus" size={18} color={colors.accent} />
            </View>
            <Avatar path={me.avatar_path} name={me.display_name} seed={me.id} size={40} />
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
              Add note
            </AppText>
          </Pressable>
        )}
        {others.map((note) => (
          <NoteBubble key={note.user_id} note={note} label={note.author.display_name} onPress={() => setOpen(note)} />
        ))}
      </ScrollView>
      <NoteSheet note={open} isMine={open?.user_id === me.id} onClose={() => setOpen(null)} />
    </View>
  );
}

function NoteBubble({ note, label, onPress }: { note: NoteWithAuthor; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const text = [note.emoji, note.body].filter(Boolean).join(' ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${text}. Open note`}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
      <View style={styles.bubble}>
        <AppText variant="caption" color={colors.text} numberOfLines={2} style={styles.bubbleText}>
          {text}
        </AppText>
      </View>
      <Avatar path={note.author.avatar_path} name={note.author.display_name} seed={note.author.id} size={40} />
      <AppText variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.name}>
        {label}
      </AppText>
    </Pressable>
  );
}

function NoteSheet({ note, isMine, onClose }: { note: NoteWithAuthor | null; isMine: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Modal visible={!!note} transparent animationType="fade" onRequestClose={onClose}>
      {/* The backdrop is a sibling BEHIND the sheet, not a wrapper: wrapping made the
          sheet's buttons <button>s nested inside the backdrop <button> on the web
          (invalid HTML, React warning, confusing focus order). */}
      <View style={styles.backdrop}>
        {/* Tap outside to close. Not focusable: keyboard and screen-reader users have
            Escape / the Close button, and focus starts on the sheet's first action. */}
        <View
          testID="note-backdrop"
          style={StyleSheet.absoluteFill}
          accessible={false}
          importantForAccessibility="no"
          onStartShouldSetResponder={() => true}
          onResponderRelease={onClose}
        />
        {note ? (
          <View style={styles.sheet} accessibilityViewIsModal aria-modal>
            <View style={styles.sheetHeader}>
              <Avatar path={note.author.avatar_path} name={note.author.display_name} seed={note.author.id} size={44} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {note.author.display_name}
                </AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  @{note.author.username} · {formatRelativeTime(note.updated_at)} · {formatStatusExpiry(note.expires_at)}
                </AppText>
              </View>
            </View>
            <View style={styles.fullNote}>
              {note.emoji ? <AppText style={styles.bigEmoji}>{note.emoji}</AppText> : null}
              {note.body ? <AppText variant="body">{note.body}</AppText> : null}
            </View>
            <View style={styles.sheetActions}>
              {isMine ? (
                <Button
                  title="Edit note"
                  icon="edit"
                  onPress={() => {
                    onClose();
                    router.push('/note');
                  }}
                />
              ) : (
                <Button
                  title="View profile"
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/user/[id]', params: { id: note.user_id } });
                  }}
                />
              )}
              <Button title="Close" variant="secondary" onPress={onClose} />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  row: { gap: Spacing.md, paddingVertical: Spacing.xs, paddingRight: Spacing.lg },
  item: { width: BUBBLE_WIDTH, alignItems: 'center', gap: Spacing.xs },
  bubble: {
    alignSelf: 'stretch',
    minHeight: 40,
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBubble: { borderStyle: 'dashed' },
  bubbleText: { textAlign: 'center' },
  name: { maxWidth: BUBBLE_WIDTH },
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: Math.min(480, MAX_CONTENT_WIDTH),
    backgroundColor: c.surfaceRaised,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  fullNote: { gap: Spacing.sm },
  bigEmoji: { fontSize: 40, lineHeight: 52 },
  sheetActions: { gap: Spacing.sm },
  flex: { flex: 1 },
}));
