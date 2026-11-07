import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Switch, View } from 'react-native';

import { BuddyPicker } from '@/components/buddy-picker';
import { Confetti } from '@/components/confetti';
import { MoodPicker } from '@/components/mood-picker';
import { SessionPhoto } from '@/components/session-photo';
import { SongCard } from '@/components/song-card';
import { SubjectPill } from '@/components/subject-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Banner, EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { VisibilityPicker } from '@/components/visibility-picker';
import type { Mood } from '@/constants/moods';
import { Radius, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { fetchSessionInvites, inviteBuddies, removeBuddy } from '@/lib/api/buddies';
import { fetchSettings, updateSettings } from '@/lib/api/profiles';
import { deleteSession, fetchSessionCard, updateSessionDetails } from '@/lib/api/sessions';
import {
  pickSessionPhoto,
  removeObject,
  sessionPhotoPath,
  uploadImage,
  type PreparedImage,
} from '@/lib/api/storage';
import { fetchGoals } from '@/lib/api/subjects';
import { claimCelebration } from '@/lib/celebration';
import { confirmAction } from '@/lib/confirm';
import { friendlyError } from '@/lib/errors';
import { goBackOr } from '@/lib/navigation';
import { invalidate } from '@/lib/events';
import { formatDuration } from '@/lib/time';
import type { BuddyInvite, Goal, ProfileSummary, SessionCardData, UserSettings, Visibility } from '@/lib/types';
import { LIMITS, validateSong } from '@/lib/validation';
import { useMe } from '@/providers/auth';
import { makeStyles, useTheme } from '@/providers/theme';
import { useSingleSubmit } from '@/hooks/use-single-submit';

type Loaded = { session: SessionCardData | null; settings: UserSettings; goals: Goal[]; invites: BuddyInvite[] };

/**
 * Completion screen (after Finish, `fresh=1`) and the editor for saved
 * sessions. The session itself is already saved privately when this opens;
 * here the user adds details and explicitly decides whether to share.
 */
export default function SessionEditScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { userId } = useMe();
  const query = useQuery<Loaded>(
    async () => {
      const [session, settings, goals, invites] = await Promise.all([
        fetchSessionCard(userId, id),
        fetchSettings(userId),
        fetchGoals(userId),
        fetchSessionInvites(id).catch(() => [] as BuddyInvite[]),
      ]);
      return { session, settings, goals, invites };
    },
    [id, userId],
  );

  if (query.loading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState message={query.error ?? 'Unknown error'} onRetry={query.reload} />;
  const { session, settings, goals, invites } = query.data;
  if (!session || session.user_id !== userId) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <EmptyState icon="info" title="Session not found" message="It may have been deleted.">
          <Button title="Go back" variant="secondary" onPress={() => goBackOr('/progress')} />
        </EmptyState>
      </Screen>
    );
  }
  return <Editor session={session} settings={settings} goals={goals} initialInvites={invites} isFresh={fresh === '1'} />;
}

function Editor({
  session,
  settings,
  goals,
  initialInvites,
  isFresh,
}: {
  session: SessionCardData;
  settings: UserSettings;
  goals: Goal[];
  initialInvites: BuddyInvite[];
  isFresh: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userId } = useMe();

  const initialVisibility: Visibility = isFresh
    ? settings.remember_visibility
      ? settings.last_visibility
      : 'private'
    : session.visibility;

  const [title, setTitle] = useState(session.title ?? `${session.subject_name} session`);
  const [accomplishment, setAccomplishment] = useState(session.accomplishment ?? '');
  const [mood, setMood] = useState<Mood | null>(session.mood);
  const [songTitle, setSongTitle] = useState(session.song_title ?? '');
  const [songArtist, setSongArtist] = useState(session.song_artist ?? '');
  const [songUrl, setSongUrl] = useState(session.song_url ?? '');
  const [goalId, setGoalId] = useState<string | null>(session.goal_id);
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [remember, setRemember] = useState(settings.remember_visibility);
  // undefined = unchanged, null = removed, PreparedImage = new photo
  const [photo, setPhoto] = useState<PreparedImage | null | undefined>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ title?: string | null; song?: string | null }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<null | Visibility>(null);
  const [invites, setInvites] = useState<BuddyInvite[]>(initialInvites.filter((i) => i.owner_id === userId));
  const [staged, setStaged] = useState<ProfileSummary[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [inviteWarning, setInviteWarning] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const reduceMotion = useReduceMotion();

  const dirty = useMemo(
    () =>
      title !== (session.title ?? `${session.subject_name} session`) ||
      accomplishment !== (session.accomplishment ?? '') ||
      mood !== session.mood ||
      songTitle !== (session.song_title ?? '') ||
      songArtist !== (session.song_artist ?? '') ||
      songUrl !== (session.song_url ?? '') ||
      goalId !== session.goal_id ||
      visibility !== session.visibility ||
      photo !== undefined ||
      staged.length > 0,
    [title, accomplishment, mood, songTitle, songArtist, songUrl, goalId, visibility, photo, staged, session],
  );

  // Protect against losing unsaved details when navigating away.
  const [leaving, setLeaving] = useState(false);
  const [blockedAction, setBlockedAction] = useState<null | { repeat: () => void }>(null);
  const disablePrevention = usePreventRemove(dirty && !saved && !leaving, ({ repeat }) => {
    confirmAction({
      title: 'Discard your changes?',
      message: isFresh
        ? 'Your study time is already saved privately. Only the details you added here will be lost.'
        : 'Your edits haven’t been saved.',
      confirmLabel: 'Discard changes',
      destructive: true,
    }).then((ok) => {
      if (ok) {
        setLeaving(true);
        setBlockedAction({ repeat });
      }
    });
  });
  // Once prevention is off, continue the navigation the user confirmed.
  useEffect(() => {
    if (leaving && blockedAction) blockedAction.repeat();
  }, [leaving, blockedAction]);
  /** Programmatic navigation after save/delete must bypass the guard. */
  const leave = (navigate: () => void) => {
    setLeaving(true);
    disablePrevention();
    navigate();
  };

  const activeGoals = goals.filter((g) => !(g.kind === 'milestone' && g.completed_at) || g.id === session.goal_id);
  const songProblem = validateSong({ title: songTitle, artist: songArtist, url: songUrl });
  const hasSong = songTitle.trim().length > 0;
  const currentPhotoPath = photo === undefined ? session.photo_path : null;

  const choosePhoto = async () => {
    setPhotoError(null);
    try {
      const picked = await pickSessionPhoto();
      if (picked) setPhoto(picked);
    } catch (e) {
      setPhotoError(friendlyError(e));
    }
  };

  const save = useSingleSubmit(async () => {
    const titleError = title.trim().length === 0 ? 'Add a title.' : null;
    setErrors({ title: titleError, song: songProblem });
    if (titleError || songProblem) {
      setSaveError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // 1. Upload a new photo first (stable path → retry-safe, upsert).
      let photoPath = session.photo_path;
      if (photo) {
        photoPath = sessionPhotoPath(userId, session.id, photo);
        await uploadImage('session-photos', photoPath, photo);
      } else if (photo === null) {
        photoPath = null;
      }
      // 2. Save details + visibility in one update.
      await updateSessionDetails(session.id, {
        title: title.trim(),
        accomplishment: accomplishment.trim() || null,
        mood,
        photo_path: photoPath,
        song_title: hasSong ? songTitle.trim() : null,
        song_artist: hasSong ? songArtist.trim() || null : null,
        song_url: hasSong ? songUrl.trim() || null : null,
        goal_id: goalId,
        visibility,
      });
      // 3. Clean up the replaced photo only after the row points elsewhere.
      if (session.photo_path && session.photo_path !== photoPath) {
        await removeObject('session-photos', session.photo_path).catch(() => undefined);
      }
      // 4. Remember the visibility preference only if the user opted in.
      if (remember !== settings.remember_visibility || (remember && visibility !== settings.last_visibility)) {
        await updateSettings(userId, { remember_visibility: remember, last_visibility: remember ? visibility : 'private' }).catch(
          () => undefined,
        );
      }
      // 5. Invite staged study buddies — only once the post is shared. A failure
      //    here doesn't undo the save; it's reported on the next screen.
      if (visibility === 'followers' && staged.length > 0) {
        try {
          await inviteBuddies(session.id, staged.map((p) => p.id));
          setStaged([]);
        } catch (e) {
          setInviteWarning(`Saved, but the study-buddy invitations weren’t sent: ${friendlyError(e)}`);
        }
      }
      invalidate('sessions', 'goals');
      // Celebrate once, after the first confirmed save of the completion flow.
      const first = await claimCelebration(session.id, { completionFlow: isFresh, saved: true });
      setCelebrate(first);
      setSaved(visibility);
    } catch (e) {
      setSaveError(`Not saved: ${friendlyError(e)} Your details are still here — try again.`);
    } finally {
      setSaving(false);
    }
  });

  const remove = useSingleSubmit(async () => {
    const ok = await confirmAction({
      title: isFresh ? 'Discard this session?' : 'Delete this session?',
      message: 'It will be removed from your history, goals and anyone’s feed. Likes and comments are deleted too.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteSession(session);
      invalidate('sessions', 'goals');
      leave(() => router.dismissTo('/feed'));
    } catch (e) {
      setSaveError(`Couldn’t delete: ${friendlyError(e)}`);
    } finally {
      setSaving(false);
    }
  });

  const removeInvite = async (invite: BuddyInvite) => {
    const accepted = invite.status === 'accepted';
    const ok = await confirmAction({
      title: accepted ? `Remove ${invite.buddy.display_name} as a study buddy?` : `Cancel the invitation to ${invite.buddy.display_name}?`,
      message: accepted ? 'They will no longer be credited on this session.' : undefined,
      confirmLabel: accepted ? 'Remove' : 'Cancel invite',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    setBusyInviteId(invite.id);
    try {
      await removeBuddy(invite.id);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      invalidate('sessions');
    } catch (e) {
      setSaveError(friendlyError(e));
    } finally {
      setBusyInviteId(null);
    }
  };

  if (saved) {
    return (
      <SavedCelebration
        visibility={saved}
        celebrate={celebrate && !reduceMotion}
        staticSuccess={celebrate && reduceMotion}
        warning={inviteWarning}
        fresh={isFresh}
        durationSeconds={session.duration_seconds}
        onViewSession={() => leave(() => router.replace({ pathname: '/session/[id]', params: { id: session.id } }))}
        onDone={() => leave(() => (saved === 'followers' ? router.dismissTo('/feed') : router.dismissTo('/progress')))}
      />
    );
  }

  const primaryLabel = visibility === 'followers' ? (isFresh ? 'Share with followers' : 'Save & share') : isFresh ? 'Save privately' : 'Save changes';

  return (
    <Screen
      scroll
      edges={['bottom', 'left', 'right']}
      keyboardOffset={100}
      footer={
        <Button title={primaryLabel} icon={visibility === 'followers' ? 'send' : 'lock'} size="lg" onPress={save} loading={saving} disabled={!!saved} />
      }>
      {isFresh ? (
        <View style={styles.hero}>
          <AppText variant="overline" color={colors.accent}>
            SESSION COMPLETE 🎉
          </AppText>
          <AppText variant="display">{formatDuration(session.duration_seconds)}</AppText>
          <SubjectPill name={session.subject_name} color={session.subject_color} />
          <AppText variant="small" color={colors.textSecondary}>
            Saved privately. Add how it went, then decide whether to share.
          </AppText>
        </View>
      ) : (
        <View style={styles.readonlyRow}>
          <SubjectPill name={session.subject_name} color={session.subject_color} />
          <AppText variant="smallStrong" color={colors.textSecondary}>
            {formatDuration(session.duration_seconds)} · recorded by timer
          </AppText>
        </View>
      )}

      {saveError ? <Banner tone="danger" message={saveError} /> : null}

      {session.intention ? (
        <View style={styles.intention}>
          <AppText variant="overline" color={colors.textSecondary}>
            YOUR INTENTION
          </AppText>
          <AppText variant="body">{session.intention}</AppText>
        </View>
      ) : null}

      <Card>
        <TextField label="Title" value={title} onChangeText={setTitle} maxLength={LIMITS.title} error={errors.title} />
        <TextField
          label="What did you accomplish?"
          value={accomplishment}
          onChangeText={setAccomplishment}
          placeholder="e.g. Finished 12 practice problems and finally get recursion"
          multiline
          maxLength={LIMITS.accomplishment}
          showCount
          hint="This is the heart of your study journal."
        />
      </Card>

      <Card>
        <AppText variant="heading">How did it feel?</AppText>
        <MoodPicker value={mood} onChange={setMood} />
      </Card>

      <Card>
        <AppText variant="heading">Photo (optional)</AppText>
        {photoError ? <Banner tone="danger" message={photoError} /> : null}
        {photo || currentPhotoPath ? (
          <>
            <SessionPhoto path={currentPhotoPath} localUri={photo?.previewUri} alt="Selected session photo" />
            <View style={styles.row}>
              <Button title="Replace" variant="secondary" size="sm" icon="photo" onPress={choosePhoto} />
              <Button title="Remove" variant="dangerGhost" size="sm" onPress={() => setPhoto(null)} />
            </View>
          </>
        ) : (
          <Button title="Add a photo from your library" variant="secondary" icon="photo" onPress={choosePhoto} />
        )}
        <AppText variant="caption" color={colors.textSecondary}>
          JPEG/PNG/WebP up to 5 MB. Photos are stored privately and only shown to people who can see this session.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">Soundtrack (optional)</AppText>
        <TextField label="Song title" value={songTitle} onChangeText={setSongTitle} maxLength={LIMITS.songTitle} />
        <TextField label="Artist" value={songArtist} onChangeText={setSongArtist} maxLength={LIMITS.songArtist} />
        <TextField
          label="Spotify or Apple Music link"
          value={songUrl}
          onChangeText={setSongUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://open.spotify.com/track/…"
          error={errors.song ?? (songUrl.trim() ? validateSong({ title: songTitle || 'x', artist: '', url: songUrl }) : null)}
        />
        {hasSong && !songProblem ? <SongCard title={songTitle.trim()} artist={songArtist.trim()} url={songUrl.trim() || null} /> : null}
      </Card>

      {activeGoals.length > 0 ? (
        <Card>
          <AppText variant="heading">Goal (optional)</AppText>
          <ChipRow>
            <Chip label="None" selected={goalId === null} onPress={() => setGoalId(null)} />
            {activeGoals.map((g) => (
              <Chip
                key={g.id}
                label={g.title}
                selected={goalId === g.id}
                onPress={() => setGoalId(g.id)}
                leading={<Icon name={g.kind === 'milestone' ? 'flag' : 'target'} size={16} />}
              />
            ))}
          </ChipRow>
        </Card>
      ) : null}

      <Card>
        <AppText variant="heading">Who can see this?</AppText>
        <VisibilityPicker value={visibility} onChange={setVisibility} />
        {visibility === 'private' && session.visibility === 'followers' && invites.some((i) => i.status !== 'declined') ? (
          <AppText variant="small" color={colors.warning}>
            Switching to Only me hides this session from your study buddies and cancels pending invitations. Sharing
            again won’t re-send them.
          </AppText>
        ) : null}
        <View style={styles.switchRow}>
          <AppText variant="small" style={styles.flex} nativeID="remember-label">
            Remember my choice for next time
          </AppText>
          <Switch
            value={remember}
            onValueChange={setRemember}
            accessibilityLabelledBy="remember-label"
            accessibilityLabel="Remember my visibility choice for next time"
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      </Card>

      <Card>
        <AppText variant="heading">Study buddies (optional)</AppText>
        <BuddyPicker
          myId={userId}
          invites={invites}
          staged={staged}
          onStage={setStaged}
          onRemoveInvite={removeInvite}
          busyInviteId={busyInviteId}
          enabled={visibility === 'followers'}
          disabledReason={
            staged.length > 0
              ? 'Choose Followers above to send these invitations. Study buddies can only be added to sessions your followers can see.'
              : 'Choose Followers above to invite study buddies. They can only be added to sessions your followers can see.'
          }
        />
      </Card>

      <Button title={isFresh ? 'Discard session' : 'Delete session'} variant="dangerGhost" icon="trash" onPress={remove} disabled={saving} />
    </Screen>
  );
}

function SavedCelebration({
  visibility,
  celebrate,
  staticSuccess,
  warning,
  fresh,
  durationSeconds,
  onViewSession,
  onDone,
}: {
  visibility: Visibility;
  /** Play the confetti burst (first confirmed save, motion allowed). */
  celebrate: boolean;
  /** Reduced motion: a calm, static success mark instead of confetti. */
  staticSuccess: boolean;
  warning: string | null;
  fresh: boolean;
  durationSeconds: number;
  onViewSession: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const shared = visibility === 'followers';
  const [showConfetti, setShowConfetti] = useState(celebrate);
  return (
    <Screen edges={['bottom', 'left', 'right']}>
      {warning ? <Banner tone="warning" message={warning} /> : null}
      {staticSuccess ? (
        <View style={styles.staticSuccess} accessibilityLabel="Session saved">
          {[colors.accent, '#C77700', '#5B5BD6', '#C2378A', colors.accent].map((c, i) => (
            <View key={i} style={[styles.staticDot, { backgroundColor: c }]} />
          ))}
        </View>
      ) : null}
      <EmptyState
        icon={shared ? 'send' : 'checkCircle'}
        title={shared ? (fresh ? 'Shared with your followers! 🎉' : 'Saved and shared') : fresh ? 'Saved to your journal ✍️' : 'Changes saved'}
        message={
          fresh
            ? `${formatDuration(durationSeconds)} of focused work, recorded. ${
                shared ? 'Your friends can cheer you on now.' : 'It counts toward your goals — share it anytime.'
              }`
            : undefined
        }>
        <Button title="View session" onPress={onViewSession} />
        <Button title={shared ? 'Go to feed' : 'See my progress'} variant="secondary" onPress={onDone} />
      </EmptyState>
      {showConfetti ? <Confetti onDone={() => setShowConfetti(false)} /> : null}
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  hero: { alignItems: 'flex-start', gap: Spacing.sm, paddingTop: Spacing.sm },
  readonlyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  intention: { backgroundColor: c.surfaceMuted, borderRadius: Radius.md, padding: Spacing.md, gap: 2 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 44 },
  flex: { flex: 1 },
  staticSuccess: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, paddingTop: Spacing.xl },
  staticDot: { width: 10, height: 10, borderRadius: 5 },
}));
