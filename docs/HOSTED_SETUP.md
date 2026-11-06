# Lockt — hosted Supabase development setup

Run Lockt against a real hosted Supabase **development** project, first in the browser, then on your phone.

> **Already set up and just pulled an update?** Skip to [Upgrading an existing project](#upgrading-an-existing-project).

Legend: 🖥️ = your computer's terminal, in the project folder (the one containing `package.json`).
🌐 = your browser (Supabase dashboard). 📱 = your phone.

**Never** paste the database password, access tokens, or the secret/service-role key into chat, code, `.env`, or Git.
The app only needs the **public** URL + publishable/anon key.

---

## 0. Get the code onto your computer 🖥️

Unzip `lockt-source.zip` (or clone your repo), then install exactly what the lockfile pins:

```bash
cd lockt
npm ci
```

Requires Node.js 20+. This also installs the pinned Supabase CLI (`npx supabase --version` → `2.122.1`).

## 1. Create a fresh development project 🌐

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name: `lockt-dev`. Pick the region closest to you.
3. Generate a strong **database password** and save it in your password manager (you'll type it once in step 3).
4. Create the project and wait until the status is healthy.
5. Note the **project ref**: the subdomain in `https://<project-ref>.supabase.co` (also shown in **Project Settings → General**).

Use a project that contains nothing else; these steps assume a fresh project.

## 2. Environment variables 🖥️

In the dashboard, open **Connect** (top bar) or **Project Settings → API Keys** and copy:

- **Project URL**: `https://<project-ref>.supabase.co`
- **Publishable key** (`sb_publishable_…`), or the legacy **anon** key. Do **not** copy the secret / `service_role` key.

```bash
cp .env.example .env
```

Edit `.env` in your editor:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

These are the only two variables the app reads. If you use the legacy key instead, set
`EXPO_PUBLIC_SUPABASE_ANON_KEY`. `.env` is git-ignored. After any change to `.env`, restart Expo with
`npx expo start -c`.

## 3. Apply the migrations to that project only 🖥️

```bash
npx supabase login
```

This opens the browser and stores the access token in your OS keychain. Don't use `--token` on the command
line, because it would land in your shell history.

```bash
npx supabase link --project-ref <project-ref>
```

When prompted, type the **database password** from step 1. The prompt hides the input; again, don't pass
`--password` on the command line.

```bash
npx supabase migration list
```

Expect 9 local migrations (`20261102000100` … `20261102000400` and `20261104000100` … `20261104000500`) and
**no** remote ones.

```bash
npx supabase db push --dry-run
```

Expect exactly those 9 files and nothing else. Then apply them:

```bash
npx supabase db push
```

```bash
npx supabase migration list
```

Local and remote should now match.

Safety notes:

- `db push` only applies migrations missing from the remote history table. It does not reset or drop anything.
- **Do not** use `--include-seed`: `supabase/seed.sql` is local-only demo data with fake accounts.
- **Do not** run `supabase db reset --linked`, which wipes the remote database.
- **Do not** run `supabase config push`. It would overwrite your dashboard Auth settings with the
  local-development values in `supabase/config.toml` (e.g. email confirmations off).

## 4. Verify storage buckets and policies 🌐

1. **Storage**: you should see two **private** buckets, `avatars` and `session-photos`.
2. **SQL Editor** → New query → paste `supabase/verify/hosted-checks.sql` → Run. Expected results are written
   next to each query: 9 migrations, 2 private buckets with 5 MB/2 MB limits and image MIME types, 8 storage
   policies, RLS on all 11 tables, no `anon` grants, 9 editable session columns, read-only notifications /
   notes / study-buddy tables, and the 8 feature functions signed-in users may call. Query 7 becomes
   meaningful after step 6. The file is read-only.

## 5. Auth: confirmation and password-reset redirects 🌐

**Authentication → Sign In / Providers → Email**: enabled, **Confirm email = on**.

**Authentication → URL Configuration**:

- **Site URL**: `http://localhost:8081`
- **Redirect URLs**: add all three:
  - `http://localhost:8081/**` (browser via `npx expo start` → `w`)
  - `exp://**` (Expo Go on your phone; links look like `exp://192.168.x.x:8081/--/reset-password`)
  - `studylog://**` (development or production builds; `studylog` is the app's internal scheme)

Leave the email templates at their defaults (they use `{{ .ConfirmationURL }}`).

**Email delivery.** Supabase's built-in email sender is for testing only. It is heavily rate-limited and, on
current plans, only delivers to addresses of members of your Supabase organization. Check
**Authentication → Emails** (and **Rate Limits**) in your dashboard. For this setup:

- Use your own address (the one you log in to Supabase with) for **account A**. It receives the confirmation
  and password-reset emails.
- For **account B**, choose one:
  - invite a second address you own to your organization (**Organization settings → Team**) and sign up
    normally; or
  - configure custom SMTP (**Authentication → Emails → SMTP Settings**); or
  - create B in **Authentication → Users → Add user → Create new user** with *Auto Confirm User* checked.
    This is a supported admin flow, and you set B's password in the dashboard, not in chat.

**How the links behave**

| Flow | Browser (`localhost:8081`) | Expo Go | Development build |
|---|---|---|---|
| Sign-up confirmation | ✅ | ✅ via `exp://` link | ✅ via `studylog://` |
| Password reset | ✅ | ✅ via `exp://` link | ✅ |

- Links use PKCE. Open them **on the same device and browser/app** that requested them.
  - A sign-up link opened elsewhere still confirms the email; the app then shows "Email confirmed — sign in".
  - A password-reset link must be opened on the device and app that requested it.
- Expo Go links embed your computer's LAN address and only work while that `npx expo start` session is
  running and reachable. If your IP changes, request a new email.
- Nothing in the core loop requires a development build. You'd need one only for the `studylog://` scheme or if
  your Expo Go can't run SDK 58 (step 8).

## 6. Create two real test accounts

1. 🖥️ `npx expo start`, then press `w`. The browser opens `http://localhost:8081`.
2. **Account A** (browser): **Create an account** with your own email → "Check your inbox" → open the email
   **in the same browser** → you land back in Lockt signed in → finish onboarding (username + display name).
3. **Account B**: either sign up the same way in a **private/incognito window** (with an address that can
   receive mail, see step 5), or create B in the dashboard and sign in, then finish onboarding.
4. Optional 🌐: run query 7 of `hosted-checks.sql`. Both usernames should be listed with `email_confirmed = true`.

The local seed accounts (`@studylog.dev`) do **not** exist on hosted Supabase. Don't use them.

## 7. Automated real-services check 🖥️

With both accounts onboarded and **no session running for A**:

```bash
npm run verify:hosted
```

It asks for both emails and passwords (hidden input, never stored or printed). It then runs about 40 checks
through real Auth, PostgREST and Storage: timer RPCs (idempotent start/finish, pause excluded, recovery from a
fresh client), photo upload and signed URLs, song, sharing, follow/like/comment persistence, B being denied
A's private session and photo (direct requests), weekly totals, the effect of visibility changes, unfollow and
deletion, plus notifications (generated, private, not forgeable), the profile highlight's private-data
protection, the study-buddy invite → accept → privacy flow, and notes (followers only, 24 h, 100 characters).
It cleans up everything it created and restores whether B follows A. Exit code 0 means every check passed.

Notes on what it touches: it never changes A's real note (if A has one, those checks print `SKIP`; clear the
note in the app to run them). Because it temporarily unfollows/refollows, A's "B started following you"
notification is re-created as a new unread item.

## 8. Run on your phone 📱

1. Install **Expo Go**. Lockt uses **Expo SDK 58**, and every native module it imports ships in Expo Go
   (expo-image, -image-picker, -image-manipulator, -crypto, -symbols, -linking, -web-browser, AsyncStorage).
   No custom native code, so Expo Go works **if your Expo Go supports SDK 58**.
2. Phone and computer on the same Wi-Fi. 🖥️ `npx expo start` → scan the QR code (Android: in Expo Go;
   iOS: Camera app). If the LAN is blocked (school/guest Wi-Fi): `npx expo start --tunnel`.
3. If Expo Go says the project is incompatible with its SDK version, use a development build instead:

   ```bash
   npx expo install expo-dev-client
   ```

   ```bash
   npx eas-cli@latest build --profile development --platform android
   ```

   This needs a free Expo account, and `npx eas-cli@latest build:configure` creates `eas.json` the first time.
   iOS device builds additionally need a paid Apple Developer account. Install the build, then
   `npx expo start` and open the project from the dev client.

## Upgrading an existing project

For a project that already has the first four migrations (your current setup). This adds five **new**
migrations; nothing already applied is edited, and existing accounts, sessions, likes, comments and photos are
kept (existing profiles get the default highlight "Hours this week"; past activity is not back-filled into
notifications).

```bash
git pull
```

```bash
npm ci
```

```bash
npx supabase migration list
```

Local should show 9 migrations, remote the first 4.

```bash
npx supabase db push --dry-run
```

Expect exactly the five `20261104000100` … `20261104000500` files. Then:

```bash
npx supabase db push
```

Then 🌐 re-run `supabase/verify/hosted-checks.sql` in the SQL Editor (expectations are written next to each
query), and 🖥️ `npm run verify:hosted`. Restart Expo with a clean cache so the new fonts are picked up:

```bash
npx expo start -c
```

## 9. Manual test checklist

Do these in the browser first, then on the phone.

1. **Auth**: sign up (A) → confirm email → sign out (Profile → Sign out) → sign back in.
2. **Timer**: Study → pick/create a subject → intention → **Start** → **Pause** (wait ~30 s) → **Resume** →
   **Finish**. The recorded time excludes the pause.
3. **Restart recovery**: start a new session. On the phone, fully close the app (swipe away), reopen it; in the
   browser, reload the tab. Study shows the same timer with the right elapsed time. Turn on airplane mode, tap
   Finish: you'll see "hasn't reached the server yet" → back online → **Retry finish**.
4. **Attachments**: on the completion screen add an accomplishment, mood, a photo from your library, and a
   song (title, artist, `https://open.spotify.com/track/…` link) → **Followers** → **Share with followers**.
   Tap the song card: it opens Spotify/Apple Music.
5. **Social**: as B → Feed → search A's username → **Follow** → A's session appears in B's feed with photo and
   song → like → open it → comment. As A: the like count and B's comment appear.
6. **Privacy**: as A, finish another session and **Save privately** with a photo. As B, it appears nowhere
   (feed, A's profile). Step 7's script covers direct-request attempts.
7. **Progress**: as A → Progress shows both sessions in this week's total. Edit the shared session to
   *Only me*: B loses it, A's totals don't change. Delete it: it disappears from A's totals and history and
   from B's feed.
8. **Password reset**: sign out → **Forgot password?** → email → open the link on the same device → set a new
   password → you're signed in → sign out and sign in with the new password.

### Two-account checklist for the warm-theme / social update

Use A and B, both on the phone if you can (or one phone + one browser). B follows A unless a step says otherwise.

1. **Fonts & theme**: text is serif everywhere (tab labels, small metadata and the timer are sans). Profile →
   Settings → Appearance: switch System / Light / Dark while a session is running on Study; the timer keeps
   counting and the status bar follows. Force-quit and reopen: the choice is kept. With System, change the
   phone's dark mode: the app follows.
2. **Larger text**: set the phone's text size to the largest (iOS: Settings → Accessibility → Display & Text
   Size → Larger Text; Android: Display → Font size). Check Feed, Study (buttons, timer), the completion screen
   and Notifications: nothing overlaps or is cut off; button labels wrap onto two centred lines.
3. **Unavailable post** (the original bug): B opens A's shared post. A edits it to **Only me**. B pulls to
   refresh → "This session is no longer available." with no comments or photo → **Go back** returns to the
   previous screen without an error, and the post is gone from B's feed. Repeat with A deleting the post, and
   with B unfollowing A from A's profile and then opening the post again.
4. **Visibility picker**: completion screen shows "Followers" and "Only me" as text with a check mark and an
   explanation; no lock/people emojis.
5. **Confetti**: A finishes a session and taps **Save privately** → confetti once. Finish another, choose
   **Followers** → confetti once. Then: edit either session and save, change its visibility, reopen it — no
   confetti. Turn airplane mode on, try to save on a fresh completion screen → error, no confetti; turn it off,
   **Save** again → confetti. With Reduce Motion on (iOS Accessibility → Motion / Android "Remove animations"):
   a static row of dots, no motion.
6. **Study buddies**: A finishes a session, picks **Followers**, searches B under "Study buddies", saves. B gets
   a notification → **Accept** → the post shows "with B" (tap opens B's profile); A gets "accepted your
   study-buddy invitation". B opens the post → **Remove me** works. A re-invites B, then switches the post to
   **Only me**: B can't open it and the invitation shows "no longer available"; sharing again doesn't bring it
   back. Have B unfollow A, then A invites B: B's notification says "Follow @A to see the session and accept".
   Self-invites aren't offered, and a declined invitation can't be re-sent.
7. **Notifications**: B follows, likes and comments on A's shared post → A's Feed bell shows a dot → the
   Notifications screen lists all three newest-first with times; tapping opens B's profile / the post.
   **Mark all read** clears the dot. Liking or commenting on your own post creates nothing. A deletes the
   post → the like/comment items disappear after a refresh, and nothing crashes if one was open.
8. **Notes**: A → Feed → **Add note** → emoji + text (watch the counter at 100) → **Share note**. B sees it at
   the top of Feed and on A's profile; tapping shows the full note and **View profile**. A third account that
   only *searched* for A sees nothing. A edits and clears the note. (Expiry after 24 h is tested
   automatically.)
9. **Progress chart**: bars are stacked by subject colour, segments add up to the day's total, tap a day to see
   its breakdown, the legend lists the week's subjects, zero days show a flat track, and private sessions are
   included. Check in dark mode too.
10. **Profile highlight**: A's profile shows "x hours this week" by default. Settings → Profile highlight →
    try each option; read the privacy note. B (follower) sees a figure from shared sessions only, and nothing
    when A picks **Wins** or **Hidden**; an account that doesn't follow A sees nothing.
11. **Study background**: Study → pick Rain / Bubbles / Leaves (live preview) → start → the background moves
    gently behind the timer; **Pause** → it stops; switch apps and come back → no stutter, timer correct;
    Reduce Motion on → still image. Force-quit/reopen: the choice is kept.
12. **Layout**: buttons and their spinners are centred (Save buttons, Accept/Decline, empty states); on the
    browser at full desktop width the actions stay in the centred column.

Report anything that fails, along with the screen, the platform (web/iOS/Android) and the exact message.
