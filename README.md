# Lockt

A social study journal: choose a subject and intention → study with a stopwatch (with an optional calm
animated background) → reflect on what you accomplished → optionally add a photo, mood, song and study
buddies → share with followers → get likes, comments and notifications → leave a short note for friends →
come back for the next session.

Warm light and dark themes (System / Light / Dark), serif typography (Source Serif 4, with Inter for compact
labels), and a forest-green accent.

Built with **Expo SDK 58 / React Native 0.88 + TypeScript**, **Expo Router**, and **Supabase** (Auth,
Postgres with Row Level Security, private Storage). Runs on iOS and Android; there is also a browser preview.

> **Naming.** The display name "Lockt" lives in `src/constants/brand.ts` (`APP_NAME`) and `app.json` (`name`).
> Internal identifiers intentionally keep the earlier working name `studylog`: the app.json `slug`, the
> deep-link scheme `studylog://`, bundle ids, storage keys and the npm package name. Changing the scheme also
> means updating `APP_SCHEME`, `supabase/config.toml` and your hosted project's redirect URLs.

**Setting up a hosted Supabase project and testing on your phone? Follow
[`docs/HOSTED_SETUP.md`](docs/HOSTED_SETUP.md).**
**Sharing Lockt with friends (hosted web app, TestFlight, Android APK, feedback)? See
[`docs/BETA.md`](docs/BETA.md).**

---

## 1. Prerequisites

- Node.js 20+ and npm
- For a **local** backend: [Docker](https://docs.docker.com/get-docker/) (the Supabase CLI runs via `npx`)
- Or a **hosted** Supabase project (free tier is fine)
- To run on a phone: the Expo Go app, or an iOS Simulator / Android Emulator

```bash
npm ci
```

## 2. Backend setup

### Option A — local Supabase (recommended for development)

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` applies everything in `supabase/migrations/` and then `supabase/seed.sql` (demo data, see below).
`npx supabase status` prints the **API URL** and the **anon / publishable key** for step 3.

### Option B — hosted Supabase project

See [`docs/HOSTED_SETUP.md`](docs/HOSTED_SETUP.md) for the full walkthrough: project creation, `.env`,
`npx supabase login` / `link` / `db push --dry-run` / `db push`, storage verification, Auth redirect URLs,
test accounts, phone testing and the checklist. The Supabase CLI is pinned as a dev dependency (2.122.1), so
`npx supabase` uses that version after `npm ci`.

Never run `db push --include-seed`, `db reset --linked` or `config push` against the hosted project.

### Demo accounts (local Docker seed only — they do not exist on hosted projects)

| Email              | Password          | Notes                                   |
|--------------------|-------------------|-----------------------------------------|
| `ada@studylog.dev` | `studylog-demo-1` | 1 shared + 1 private session, 2 goals  |
| `ben@studylog.dev` | `studylog-demo-2` | Follows Ada, 1 shared session           |

## 3. Configure the app

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Only public values belong here — **never** a service-role key. On a
physical phone with a local backend, use your computer's LAN IP instead of `127.0.0.1`.

Without these variables the app shows a "needs a Supabase project" screen instead of crashing.

## 4. Run

```bash
npm start
```

Press `i` (iOS simulator), `a` (Android emulator) or `w` (browser), or scan the QR code with Expo Go. All
native modules used (image picker, image manipulator, crypto, symbols, font, system UI, AsyncStorage, and
`react-native-svg` for the logo, like heart and sign-up decals) ship with Expo Go, so no custom dev build is
required. Fonts are bundled files loaded with `expo-font`; the animations (confetti, study backgrounds,
hold-to-finish) use React Native's built-in `Animated` API.

Production web build (what the hosting providers run; output in `dist/`):

```bash
npx expo export --platform web
```

> Tip: `CI=1 npx expo start` disables file watching, so edits won't reload; run `npx expo start` normally while
> developing.

## 5. Checks and tests

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

- `npm test` — unit + UI + web tests (runs in `America/Los_Angeles` so DST weeks are exercised):
  - unit: timer math across pause/resume/background/restart, clock skew, calendar-week boundaries
    (167/169-hour DST weeks), weekly goal progress, stats and stacked-chart subject segments, validation,
    error mapping, status rules, highlight formatting, notification destinations for stale targets,
    appearance/background preference persistence, once-per-session confetti.
  - ui (`*.test.tsx`, expo-router testing library): the unavailable-post navigation regression (post made
    private / deleted / access revoked while open, opened from a link with no history), the study
    background's animation lifecycle (paused, reduced motion, hidden screen), hold-to-finish (quick tap, early
    release, 3 s hold, exactly once, background/blur/screen change/unmount/busy cancel), completion confetti on
    the real screen (failed save, retry, shared, reopen, edit, reduced motion), optimistic like rollback,
    single-submit sign-in/sign-up, and the feedback form.
  - web (`*.web.test.tsx`, `jest-expo/web` + react-dom into jsdom): the DOM that react-native-web produces —
    `aria-checked` on radios and Space activation, real `href`s on link rows, Button double-click protection,
    the filled/hollow heart with `aria-pressed`, the Note sheet without nested buttons, and hold-to-finish by
    keyboard (key repeat ignored) and mouse.
  - unit also covers v2.5 emoji segmentation (skin tones, ZWJ, flags, keycaps), subject palette contrast and
    distinctness, confetti geometry, and feedback validation.
- `npm run verify:hosted` — runs ~40 checks against your **hosted** project through the real Auth, Data API
  and Storage services, using two of your test accounts (passwords typed at a hidden prompt) and the public key
  only. It cleans up after itself. See `docs/HOSTED_SETUP.md` step 7.
- `npm run test:db` — creates a throw-away `studylog_test` database on any PostgreSQL 15+ server where you are
  superuser, loads a small Supabase compatibility shim (`tests/db/supabase-shim.sql`: API roles, `auth.uid()`,
  `storage.objects`) and then the **real migrations**. Each "request" runs exactly as PostgREST would run it
  (`set local role authenticated` + `request.jwt.claims`), so RLS, column grants and RPCs are exercised for
  real. Covers duplicate-start/finish prevention (including concurrent calls), timer idempotency and conflicts,
  unauthorized reads/writes, follow/like uniqueness, feed/photo/comment visibility, the full two-account
  scenario, and (`tests/db/features.test.ts`) study-buddy transitions and privacy, notification generation,
  deduplication, authorization and stale targets, profile-status ownership/length/expiry/audience, and the
  profile highlight's private-data protection; (`tests/db/feedback.test.ts`) feedback is insert-only through
  `submit_feedback` (nobody can read, edit or delete it via the API, anon can't submit), validation, the hourly
  rate limit, and that keyboard emoji sequences are accepted by the notes constraint.

---

## How it works

### App structure

```
src/app/                 Expo Router routes
  (auth)/                sign-in, sign-up (logo + embossed decals), forgot-password
  (tabs)/                feed (logo, notes strip, notification bell), study, progress, profile
  session/[id]/          detail (+comments, buddy invitation) and edit/completion screen (+buddies, confetti)
  user/[id]/             profile and follower/following lists
  notifications, note (your note; `/status` is reserved by Metro's dev server), settings (appearance,
  profile highlight, Send feedback), feedback
  search, subjects, goals/new, profile/edit, onboarding, reset-password, auth-callback
src/constants/           theme.ts (warm light/dark palettes, type scale), fonts.ts (font families)
src/providers/           auth + profile state, active-session (timer) state, theme, toasts
src/lib/                 Supabase client, API modules, pure logic (timer, week, stats, status, highlight, …)
assets/fonts/            bundled Source Serif 4 + Inter with their OFL licenses
supabase/migrations/     schema, RPCs, RLS + grants, storage, (20261104*) highlight, notes,
                         notifications, study buddies, and (20261106*) beta feedback
assets/images/logo.svg   source of the Lockt mark (icons/favicon were rendered from it)
netlify.toml, vercel.json  static web hosting with single-page fallback (docs/BETA.md)
eas.json                 EAS build profiles for an Android preview APK and store/TestFlight builds
tests/db/                database integration tests
```

### Timer reliability

- An active session is a `study_sessions` row with `status='active'`. Elapsed time is always
  `accumulated_ms + (now − running_since)` from **persisted timestamps**; the 1-second interval only
  re-renders the display. Backgrounding, killing the app or switching tabs can't lose time.
- All transitions (`start_session`, `pause_session`, `resume_session`, `finish_session`, `discard_session`)
  are `SECURITY DEFINER` RPCs that use the **database clock**. The client estimates its clock offset from
  `server_now` in each response so the display matches the server.
- **One active session per account** is enforced by a partial unique index. `start_session` is idempotent on a
  client-generated id (retries can't duplicate). `finish_session` is idempotent: repeated or concurrent calls
  return the same completed row.
- If an action fails because the network is down, the app keeps it as **pending** (persisted locally) with the
  moment you tapped, says clearly that it wasn't saved, and offers Retry. The retry records the original
  pause/finish time (the server clamps it to a valid range).
- A local cache shows your timer instantly after a restart; it is reconciled with the server on launch and
  whenever the app returns to the foreground (so changes from another device show up).
- Finishing saves the session **privately**; sharing is an explicit step on the completion screen.
  Sessions are capped at 24 h of active time, and the timer warns after 8 h.

### Security model (enforced in the database, not only the UI)

- `anon` has no access to any table or object. Profiles and the follow graph are visible to signed-in users.
- Subjects, goals and settings are owner-only. A session is visible to its owner, and to the owner's
  **followers** only when it is completed and shared with "Followers". Likes, comments and photos inherit the
  session's visibility, so unfollowing or switching a session to "Only me" immediately removes access.
- Column-level grants mean clients can only edit a completed session's descriptive fields (title,
  accomplishment, mood, photo, song, goal, visibility); durations, timestamps, counters and ownership can't
  be changed directly. Sessions can only be created through the RPCs.
- Photos and avatars live in **private** buckets with server-side size and MIME limits (5 MB / 2 MB;
  JPEG/PNG/WebP). Images are shown through 10-minute signed URLs, which Storage only issues if the caller
  passes the SELECT policy.
- Checks and unique keys prevent self-follows, duplicate follows and likes, invalid usernames and colours,
  non-Spotify/Apple Music or non-https song links, and photo paths outside the owner's folder.
- Subjects are archived rather than deleted. Sessions keep a name/colour snapshot (kept in sync on rename),
  so history never breaks and feeds never need access to another user's subjects.
- Deleting a session cascades its likes and comments; the app then removes the photo object.

### Social features (all enforced in the database)

- **Notifications** are written only by database triggers on real events (follow, like, comment, study-buddy
  invitation/acceptance). Clients can read their own and set `read_at`, nothing else. Self-actions never
  notify, a unique key per recipient makes retries harmless, and undoing an action (unlike, unfollow, deleting
  a comment or session) removes its notification. `list_notifications()` runs with the reader's permissions,
  so post titles and comment excerpts only come back while the reader can still see the post; otherwise the
  item shows "This session is no longer available" and links to the person instead.
- **Study buddies** are attribution only: no session, time, goal progress or wins are created for the buddy,
  and the post is not distributed to their followers. Invitations require a session shared with followers;
  accepting requires following the owner. Pending invitations are visible only to the owner and invitee.
  Switching the post to "Only me" hides it from everyone and revokes pending invitations; sharing again
  doesn't revive them (the owner can invite again explicitly). Declined invitations can't be re-sent.
- **Notes (profile statuses)**: optional emoji + up to 100 characters, one per person, readable by followers
  only, expiring 24 hours after the latest save (database clock). Expired notes are invisible to every query.
- **Profile highlight**: the owner picks Hours this week (default), Sessions this week, Wins this week,
  Lifetime hours or Hidden. On your own profile it counts everything, including private sessions; followers
  get figures computed only from sessions currently shared with them; non-followers get nothing; wins
  (milestones marked complete this week) are owner-only because goals are private.
- **Confetti** plays once per session, after the first confirmed save on the completion screen (Followers or
  Only me), never on failure, retries, edits or reopening; with reduced motion a static success mark is shown.
  v2.5: a ~1.7 s radial burst from just above the centre of the screen (`CONFETTI_ORIGIN`), never blocking touches.
- **Beta feedback** (v2.5): Settings → Send feedback → Bug / Suggestion / Other + message. Stored through the
  `submit_feedback` SECURITY DEFINER function with the caller's id, app version and platform only; the table has
  no API grants, so nobody (including the sender) can read it through the app. Owners read it in the dashboard
  (query in `docs/BETA.md`). 20 per account per hour.

### Calendar week

Weeks run **Monday 00:00 → next Monday 00:00 in the device's current time zone**, and a session counts on
the day it **started**. This is shown on the Progress screen and the goal form. Weekly time goals count
every completed session in the week (private or shared, optionally filtered by subject); discarded sessions
are deleted and paused time is never recorded. Milestones are only completed when you mark them.

---

## Known limitations

- No offline queue beyond the timer's pending-action retry. Other edits show an error and keep your input,
  but they aren't queued.
- If removing a photo from Storage fails after a session is deleted, the orphaned object stays private to its
  owner (no visible session references it). A scheduled cleanup job would be a later addition.
- Signed photo URLs already handed out stay valid until they expire (≤10 min) after access is revoked.
- Following needs no approval, and there's no blocking or reporting yet.
- Password reset and email confirmation rely on deep links opened **on the same device** (PKCE).
- Bundle identifiers are still the placeholder `com.example.studylog`; choose your own before a store/TestFlight
  build (see `docs/BETA.md`).
- The web build has a favicon but no web manifest / home-screen icon yet.
- Hold-to-finish relies on press-and-hold; VoiceOver/TalkBack users can use their screen reader's "double-tap and
  hold" gesture. There is deliberately no single-activation shortcut.
- Feedback can't be viewed or deleted in the app (dashboard only), and there are no attachments.
- Notifications are in-app only (no push). Existing activity from before the notifications migration is not
  backfilled.
- Appearance and study-background choices are stored per device, not per account.
- Tiempos Text is not bundled (commercial license); Source Serif 4 is the default. See `assets/fonts/README.md`.
