import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SessionCard } from '@/components/session-card';
import { Button, IconButton } from '@/components/ui/button';
import { PressableLink } from '@/components/ui/pressable-link';
import { Banner, EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { MAX_CONTENT_WIDTH, Radius, Spacing, Type } from '@/constants/theme';
import { useLikeToggle } from '@/hooks/use-like-toggle';
import { useQuery } from '@/hooks/use-query';
import { fetchMyInvite, removeBuddy, respondToInvite } from '@/lib/api/buddies';
import { fetchSessionCard } from '@/lib/api/sessions';
import { forgetSignedUrl } from '@/lib/api/storage';
import { addComment, deleteComment, fetchComments } from '@/lib/api/social';
import { confirmAction } from '@/lib/confirm';
import { friendlyError, isAccessDenied } from '@/lib/errors';
import { announceSessionUnavailable, invalidate } from '@/lib/events';
import { randomId } from '@/lib/ids';
import { goBackOr } from '@/lib/navigation';
import { formatRelativeTime } from '@/lib/time';
import type { BuddyInvite, Comment, SessionCardData } from '@/lib/types';
import { LIMITS } from '@/lib/validation';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';
import { makeStyles, useTheme } from '@/providers/theme';

type Detail = { session: SessionCardData | null; comments: Comment[]; myInvite: BuddyInvite | null };

/**
 * Losing access (deleted, switched to "Only me", unfollowed) is an expected
 * state, not an error: RLS simply returns no row. We then drop everything we
 * had shown (details, comments, photo URL), remove the session from cached
 * lists, and offer a way back that never dispatches an unhandled GO_BACK.
 */
export default function SessionDetailScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, profile } = useMe();
  const toast = useToast();
  const query = useQuery<Detail>(
    async () => {
      const session = await fetchSessionCard(userId, id);
      // Comments are only readable when the session is (RLS); skip if hidden.
      const [comments, myInvite] = session
        ? await Promise.all([
            fetchComments(id),
            session.user_id === userId ? null : fetchMyInvite(id, userId).catch(() => null),
          ])
        : [[], null];
      return { session, comments, myInvite };
    },
    [id, userId],
    // 'social': unfollowing elsewhere revokes access, so re-check on focus.
    { topics: ['sessions', 'social'] },
  );
  const updateSession = useCallback(
    (_: string, patch: (s: SessionCardData) => SessionCardData) =>
      query.setData((prev) => (prev?.session ? { ...prev, session: patch(prev.session) } : prev)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  /** Re-check access after the server refused an interaction. */
  const recheck = useCallback(() => {
    query.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleLike = useLikeToggle(updateSession, recheck);
  const [draft, setDraft] = useState('');
  const [draftId, setDraftId] = useState(() => randomId());
  const [sending, setSending] = useState(false);
  // Synchronous guards: a click plus Enter in the same frame must not post twice.
  const sendingRef = useRef(false);
  const deletingRef = useRef(new Set<string>());
  const [sendError, setSendError] = useState<string | null>(null);

  // Remember the photo we showed so its signed URL can be forgotten once access is lost.
  const shownPhoto = useRef<string | null>(null);
  const announced = useRef(false);
  const loadedSession = query.data?.session;
  const unavailable = !!query.data && !loadedSession;
  useEffect(() => {
    if (loadedSession) {
      shownPhoto.current = loadedSession.photo_path;
      announced.current = false;
      return;
    }
    if (!unavailable || announced.current) return;
    // Once per transition: no refetch loops, no repeated requests.
    announced.current = true;
    if (shownPhoto.current) forgetSignedUrl('session-photos', shownPhoto.current);
    shownPhoto.current = null;
    announceSessionUnavailable(id);
  }, [loadedSession, unavailable, id]);

  if (query.loading) return <LoadingState />;
  if (query.error && !query.data) return <ErrorState message={query.error} onRetry={query.reload} />;
  const session = query.data?.session;
  if (!session) {
    return <UnavailableSession />;
  }
  const isOwner = session.user_id === userId;
  const comments = query.data?.comments ?? [];

  const send = async () => {
    const body = draft.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      // Same id on retry → never a duplicate comment.
      await addComment({ id: draftId, sessionId: session.id, userId, body });
      const fresh = await fetchComments(session.id).catch(() => null);
      query.setData((prev) =>
        prev
          ? {
              ...prev,
              comments:
                fresh ??
                [
                  ...prev.comments,
                  {
                    id: draftId,
                    session_id: session.id,
                    user_id: userId,
                    body,
                    created_at: new Date().toISOString(),
                    author: { id: userId, username: profile.username, display_name: profile.display_name, avatar_path: profile.avatar_path },
                  },
                ],
              session: prev.session ? { ...prev.session, comment_count: prev.session.comment_count + 1 } : prev.session,
            }
          : prev,
      );
      setDraft('');
      setDraftId(randomId());
      invalidate('sessions');
    } catch (e) {
      if (isAccessDenied(e)) {
        // Access was revoked while the screen was open.
        setDraft('');
        recheck();
        return;
      }
      setSendError(`Comment not posted: ${friendlyError(e)}`);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const remove = async (comment: Comment) => {
    if (deletingRef.current.has(comment.id)) return;
    deletingRef.current.add(comment.id);
    try {
      const ok = await confirmAction({ title: 'Delete your comment?', confirmLabel: 'Delete', destructive: true });
      if (!ok) return;
      await deleteComment(comment.id);
      query.setData((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.filter((c) => c.id !== comment.id),
              session: prev.session ? { ...prev.session, comment_count: Math.max(0, prev.session.comment_count - 1) } : prev.session,
            }
          : prev,
      );
      invalidate('sessions');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      deletingRef.current.delete(comment.id);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerRight: isOwner
            ? () => (
                <IconButton
                  icon="edit"
                  label="Edit session"
                  onPress={() => router.push({ pathname: '/session/[id]/edit', params: { id: session.id } })}
                />
              )
            : undefined,
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
        <FlatList
          testID="session-detail-list"
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} tintColor={colors.accent} />
          }
          ListHeaderComponent={
            <View style={[styles.column, styles.header]}>
              <SessionCard session={session} expanded onToggleLike={toggleLike} />
              {query.data?.myInvite ? (
                <MyInvitation
                  invite={query.data.myInvite}
                  ownerName={session.author.display_name}
                  onChanged={() => {
                    invalidate('sessions');
                    query.refresh();
                  }}
                />
              ) : null}
              <AppText variant="heading" accessibilityRole="header">
                Comments
              </AppText>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          renderItem={({ item }) => (
            <View style={[styles.column, styles.comment]}>
              <PressableLink
                href={`/user/${item.author.id}`}
                onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.author.id } })}
                accessibilityLabel={`${item.author.display_name}'s profile`}>
                <Avatar path={item.author.avatar_path} name={item.author.display_name} seed={item.author.id} size={36} />
              </PressableLink>
              <View style={styles.commentBody}>
                <AppText variant="smallStrong">
                  {item.author.display_name}{' '}
                  <AppText variant="caption" color={colors.textSecondary}>
                    · {formatRelativeTime(item.created_at)}
                  </AppText>
                </AppText>
                <AppText variant="body">{item.body}</AppText>
              </View>
              {item.user_id === userId ? (
                <IconButton icon="trash" label="Delete comment" size={18} color={colors.textSecondary} onPress={() => remove(item)} />
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <AppText variant="small" color={colors.textSecondary} style={styles.column}>
              {isOwner ? 'No comments yet.' : 'Be the first to cheer them on 👏'}
            </AppText>
          }
        />
        <View style={styles.composerWrap}>
          {sendError ? (
            <View style={styles.column}>
              <Banner tone="danger" message={sendError} actionLabel="Retry" onAction={send} />
            </View>
          ) : null}
          <View style={[styles.column, styles.composer]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add encouragement…"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Write a comment"
              maxLength={LIMITS.comment}
              multiline
              style={styles.input}
              // Desktop web: Enter posts, Shift+Enter adds a new line. Phones keep the return key for new lines.
              {...(Platform.OS === 'web'
                ? {
                    onKeyPress: (e: { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault: () => void }) => {
                      if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    },
                    accessibilityHint: 'Press Enter to post, Shift+Enter for a new line',
                  }
                : {})}
            />
            <Button title="Post" size="sm" onPress={send} loading={sending} disabled={!draft.trim()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The viewer's own study-buddy invitation on this session. */
function MyInvitation({ invite, ownerName, onChanged }: { invite: BuddyInvite; ownerName: string; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<null | 'accept' | 'decline' | 'remove'>(null);
  const run = async (kind: 'accept' | 'decline' | 'remove') => {
    if (kind === 'remove') {
      const ok = await confirmAction({
        title: 'Remove yourself as a study buddy?',
        message: `You won’t be credited on ${ownerName}’s session any more.`,
        confirmLabel: 'Remove me',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(kind);
    try {
      if (kind === 'remove') await removeBuddy(invite.id);
      else await respondToInvite(invite.id, kind === 'accept');
      toast(kind === 'accept' ? 'You’re a study buddy on this session.' : kind === 'decline' ? 'Invitation declined.' : 'Removed.');
      onChanged();
    } catch (e) {
      toast(friendlyError(e), 'error');
      onChanged();
    } finally {
      setBusy(null);
    }
  };
  if (invite.status === 'pending') {
    return (
      <Banner
        tone="info"
        message={`${ownerName} invited you to be a study buddy on this session.`}
        actionLabel={busy === 'accept' ? 'Accepting…' : 'Accept'}
        onAction={() => !busy && run('accept')}
        secondaryLabel={busy === 'decline' ? 'Declining…' : 'Decline'}
        onSecondary={() => !busy && run('decline')}
      />
    );
  }
  if (invite.status === 'accepted') {
    return (
      <Banner
        tone="success"
        message="You’re a study buddy on this session."
        secondaryLabel={busy === 'remove' ? 'Removing…' : 'Remove me'}
        onSecondary={() => !busy && run('remove')}
      />
    );
  }
  return null;
}

function UnavailableSession() {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Session', headerRight: undefined }} />
      <EmptyState
        icon="lock"
        title="This session is no longer available."
        message="It may have been deleted or made private, or you may no longer follow this person.">
        <Button title="Go back" variant="secondary" onPress={() => goBackOr('/feed')} />
      </EmptyState>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  flex: { flex: 1 },
  list: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { gap: Spacing.lg, marginBottom: Spacing.md },
  comment: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  commentBody: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.surface,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  input: {
    ...Type.body,
    flex: 1,
    color: c.text,
    backgroundColor: c.background,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    minHeight: 44,
    maxHeight: 120,
  },
}));
