import type { Mood } from '@/constants/moods';

export type Visibility = 'private' | 'followers';

export type HighlightStat = 'wins_week' | 'sessions_week' | 'hours_week' | 'hours_lifetime' | 'hidden';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
  /** Statistic featured on the profile header (owner's choice). */
  highlight_stat: HighlightStat;
};

export type ProfileSummary = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'>;

export type UserSettings = {
  user_id: string;
  remember_visibility: boolean;
  last_visibility: Visibility;
};

export type Subject = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  archived_at: string | null;
  created_at: string;
};

export type GoalKind = 'weekly_time' | 'milestone';

export type Goal = {
  id: string;
  user_id: string;
  kind: GoalKind;
  title: string;
  subject_id: string | null;
  weekly_target_minutes: number | null;
  target_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
};

/** Full study_sessions row (as returned by the timer RPCs). */
export type StudySession = {
  id: string;
  user_id: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  goal_id: string | null;
  status: 'active' | 'completed';
  timer_state: 'running' | 'paused' | null;
  intention: string | null;
  started_at: string;
  running_since: string | null;
  accumulated_ms: number;
  ended_at: string | null;
  duration_seconds: number | null;
  completed_at: string | null;
  title: string | null;
  accomplishment: string | null;
  mood: Mood | null;
  photo_path: string | null;
  song_title: string | null;
  song_artist: string | null;
  song_url: string | null;
  visibility: Visibility;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
};

export type CompletedSession = StudySession & {
  status: 'completed';
  duration_seconds: number;
  completed_at: string;
};

/** A completed session as shown on cards: with author and whether I liked it. */
export type SessionCardData = CompletedSession & {
  author: ProfileSummary;
  liked_by_me: boolean;
  /** Accepted study buddies only (pending invitations are never shown). */
  buddies: { inviteId: string; profile: ProfileSummary }[];
};

export type BuddyStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

/** A study-buddy invitation as seen by the session owner (or the invitee). */
export type BuddyInvite = {
  id: string;
  session_id: string;
  owner_id: string;
  buddy_id: string;
  status: BuddyStatus;
  created_at: string;
  responded_at: string | null;
  buddy: ProfileSummary;
};

export type ProfileStatus = {
  user_id: string;
  emoji: string | null;
  body: string | null;
  updated_at: string;
  expires_at: string;
};

export type NoteWithAuthor = ProfileStatus & { author: ProfileSummary };

export type NotificationKind = 'follow' | 'like' | 'comment' | 'buddy_invite' | 'buddy_accepted';

/** A notification as returned by list_notifications() (targets already access-checked). */
export type AppNotification = {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor: ProfileSummary;
  /** Null when the session was deleted or the reader can no longer see it. */
  session_id: string | null;
  session_title: string | null;
  comment_excerpt: string | null;
  invite_id: string | null;
  invite_status: BuddyStatus | null;
};

export type HighlightValue = {
  kind: Exclude<HighlightStat, 'hidden'>;
  /** Seconds for hours_*, a count for wins/sessions. */
  value: number;
  /** 'all' on your own profile; 'shared' when computed for a follower. */
  scope: 'all' | 'shared';
};

export type Comment = {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: ProfileSummary;
};

export type TimerPayload = {
  session: StudySession | null;
  server_now: string;
};
