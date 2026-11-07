# Lockt friends beta (v2.5)

How to let a few friends use Lockt on their own (no computer or Expo dev server of yours running), how they
sign up and find each other, how they send feedback, and how you read it.

> **Status of this guide.** Everything here is **ready to deploy, not deployed**. The web build, the hosting
> configuration (`netlify.toml`, `vercel.json`), the feedback migration and the EAS profiles were prepared and
> tested locally: a production web export served with the same single-page fallback, against a local Supabase
> stack, with two brand-new accounts (sign-up, onboarding, sessions, photo upload, follow, like, comment, privacy,
> direct links, refresh, sign-out/in, feedback). **No site has been published, no hosted migration has been
> applied, no store build has been made, and nothing was tested on a physical phone.**

---

## 1. The simplest path: a hosted web app (recommended)

Friends open a link (e.g. `https://lockt-beta.netlify.app`) in their phone's browser and can "Add to Home
Screen". Nothing to install, works on iPhone and Android, updates when you push.

### 1.1 One-time Supabase setup 🌐

1. **Apply the new migration** to your hosted project (adds `feedback`; nothing existing changes):

   ```bash
   npx supabase migration list
   ```

   Local should show 10 migrations and remote 9 (if you followed the v2 setup).

   ```bash
   npx supabase db push --dry-run
   ```

   Expect exactly `20261106000100_feedback.sql`. Then:

   ```bash
   npx supabase db push
   ```

   Re-run `supabase/verify/hosted-checks.sql` in the SQL Editor (query 1 → 10 rows, 4 → 12 tables, 11 → feedback
   locked down), then `npm run verify:hosted` (it now also checks that feedback can't be read through the API).

2. **Authentication → URL Configuration** (after you know your site address, step 1.2):
   - **Site URL**: `https://<your-site>` (e.g. `https://lockt-beta.netlify.app`). Confirmation emails link here.
   - **Redirect URLs**: add `https://<your-site>/**`. Keep `http://localhost:8081/**`, `exp://**` and
     `studylog://**` for development.
   - The app sends `https://<your-site>/auth-callback` (sign-up confirmation) and `https://<your-site>/reset-password`
     (password reset). Both are covered by the `/**` entry.

3. **Email delivery (important).** Supabase's built-in email sender only delivers to members of your Supabase
   organization and is heavily rate-limited, so **friends won't receive confirmation emails** with it. Pick one:
   - **Recommended:** set up custom SMTP (**Authentication → Emails → SMTP Settings**) with a transactional email
     provider's free tier (e.g. Resend, Postmark, Brevo, Amazon SES). You need a sender address/domain you control.
     Then raise **Authentication → Rate Limits → emails per hour** to something like 30.
   - **Fallback for a tiny beta:** keep "Confirm email" on and create each friend in **Authentication → Users → Add
     user → Create new user** with *Auto Confirm User*, then tell them their temporary password privately and have
     them change it (Sign out → Forgot password? needs working email, so prefer SMTP).
   - Turning "Confirm email" **off** works but lets anyone sign up with an address they don't own. Not recommended.

4. Leave everything else as in `docs/HOSTED_SETUP.md`. Never put the secret/service-role key anywhere in the app or
   the hosting provider. The site only needs the **publishable** (or legacy anon) key.

### 1.2 Deploy on Netlify (free tier) 🌐

The repository already contains `netlify.toml` (build command, `dist` folder, single-page fallback so links like
`/session/<id>` and refreshes work, and cache headers).

1. Push this branch to GitHub (merge it into your main branch when you're happy).
2. <https://app.netlify.com> → **Add new site → Import an existing project → GitHub** → pick `lockt-v2` and the
   branch to publish. Netlify reads `netlify.toml`; don't change the build settings.
3. **Site configuration → Environment variables → Add** (both are public values):
   - `EXPO_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…` (or set `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
4. **Deploys → Trigger deploy**. When it's live, optionally rename the site (**Site configuration → Change site
   name**, e.g. `lockt-beta`) and put the final `https://…netlify.app` address into Supabase (step 1.1.2).
5. Open the site, create an account, and run the two-account checklist below before inviting anyone.

Every push to that branch redeploys. Variables are baked in at build time, so **redeploy after changing them**.

**Without GitHub (manual):** build locally with your `.env` filled in, then drag the `dist` folder onto
<https://app.netlify.com/drop> (or use `npx netlify-cli deploy --prod --dir dist`). Manual uploads don't read
`netlify.toml`, so also copy the redirect rule: create `dist/_redirects` containing `/*  /index.html  200`
before uploading.

```bash
npx expo export --platform web
```

**Vercel instead:** `vercel.json` is included (same build, output and rewrites). Import the repo at
<https://vercel.com/new>, framework preset "Other", add the same two environment variables, deploy.

### 1.3 How web sign-in behaves

- Logins persist in the browser (localStorage) and refresh automatically; closing the tab doesn't sign you out.
- Email links use PKCE: open them **in the same browser** that requested them (on iPhone, the link from Mail
  opens Safari; if the friend signed up inside another browser, they'll see "Email confirmed — sign in" and just
  sign in).
- "Add to Home Screen" (Safari share sheet / Chrome menu) gives a full-screen shortcut. The browser tab shows the
  new Lockt favicon; a dedicated home-screen icon/web manifest isn't configured yet (iOS may use a page snapshot).

---

## 2. What to send friends

> Hi! I'm testing a study app I built, **Lockt**. Open <https://your-site> on your phone (Safari/Chrome),
> tap **New here? Create an account**, confirm your email, and pick a username. Then tap the 🔍 on the Feed and
> search for **@your_username** to follow me. Start a session from **Study**; hold **Finish** for 3 seconds when
> you're done. Found a bug or have an idea? **Profile → ⚙︎ (top right) → Send feedback**. Thanks!

- **Create an account:** Sign up → confirm email → choose username + display name (onboarding).
- **Find each other:** Feed → search icon (top right) → type a username or name → **Follow**. Following is
  one-way and needs no approval; you see someone's shared sessions and note once you follow them.
- **Privacy:** sessions are saved privately when finished; sharing is a choice on the completion screen
  (Followers / Only me). Photos are private storage objects shown only to people who can see the session.
- **Feedback:** Profile → Settings (gear icon) → **Send feedback** → Bug / Suggestion / Other → message.

Each friend uses their **own** account. Don't share test credentials; the local `@studylog.dev` seed accounts
don't exist on hosted projects.

---

## 3. Reading feedback

Feedback is stored in `public.feedback` (category, message, app version, platform, account, time). The app can
only **insert** through the `submit_feedback` function: nobody can read feedback through the API, not even their
own. You read it as the project owner:

- Dashboard → **Table Editor → feedback**, or
- Dashboard → **SQL Editor**:

  ```sql
  select f.created_at, f.category, p.username, f.platform, f.app_version, f.message
  from public.feedback f join public.profiles p on p.id = f.user_id
  order by f.created_at desc;
  ```

To remove an entry, delete the row in the Table Editor. Deleting an account deletes its feedback. Each account
can send at most 20 messages per hour.

---

## 4. Optional: native builds

Both need a free Expo account (<https://expo.dev/signup>) and EAS CLI. `eas.json` has two profiles:
`preview` (internal distribution; Android APK) and `production` (store builds, auto-incremented build numbers).

> **Before your first EAS build:** `app.json` still uses the placeholder identifiers `com.example.studylog`
> (iOS bundle id and Android package). They were deliberately **not** changed in v2.5. Store builds need an
> identifier you own (e.g. `com.yourname.lockt`); changing it is a one-time decision because it can't be
> changed after you publish. Keep the `studylog` scheme unless you also update Supabase redirect URLs.

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

`init` links the project and adds `extra.eas.projectId` to `app.json`. Then store the two public variables for the
build environments (they're bundled into the app, so "plaintext"/"sensitive" visibility is fine — never the
secret key):

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<project-ref>.supabase.co --environment preview --environment production --visibility plaintext
```

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --environment preview --environment production --visibility plaintext
```

You can also add them on expo.dev → your project → **Environment variables**. (`.env` is git-ignored and is not
uploaded to EAS, so builds can't see it.) The Expo docs site couldn't be
reached from the environment that prepared this file; check `eas.json` options against
<https://docs.expo.dev/build/eas-json/> if the CLI warns about anything.

### Android (easiest native option)

```bash
npx eas-cli@latest build --platform android --profile preview
```

EAS builds an **APK** and gives you an install link/QR code. Friends open it on Android, allow "install unknown
apps" for their browser, and install. No Play Store account needed. (For a Play Store testing track instead: a
Google Play Console account, one-time $25, then `--profile production` and upload the AAB to *Internal testing*.)

### iPhone via TestFlight

Requirements: **Apple Developer Program** membership ($99/year), a unique bundle identifier (see above), and an
app record in App Store Connect (EAS can create it).

```bash
npx eas-cli@latest build --platform ios --profile production
```

```bash
npx eas-cli@latest submit --platform ios --latest
```

EAS handles signing certificates and provisioning. After processing (~10–30 min) the build appears in App Store
Connect → TestFlight. **Internal testers** (people added to your App Store Connect team, up to 100) can install
immediately. **External testers** (anyone with an email or a public link, up to 10,000) need a one-time **Beta App
Review** (usually about a day) and test information (what to test, contact email, privacy policy URL). iPhones
can't install the Android-style "preview" build without registering each device's UDID (ad-hoc), so TestFlight is
the practical route.

Native apps reach Supabase directly; email links use the `studylog://` scheme (already in the redirect list).

---

## 5. Pre-invite checklists

### Two-account check on the deployed site (≈ 15 min)

Use two of **your own** addresses (or one browser + one private window). Mark each ✅/❌.

1. A: Create account → confirmation email arrives → link opens the site signed in → onboarding.
2. B: same, in a private window or another phone.
3. B: Feed → search A → Follow. A: Notifications shows "B started following you".
4. A: Study → create subject → Start → Pause → Resume → **tap** Finish (nothing happens, label explains) →
   **hold** Finish 3 s → completion screen → add a photo → Followers → Share → confetti once.
5. B: Feed shows A's session with photo → like (heart fills red) → open → comment → refresh the page on the post
   (still signed in, still there).
6. A: another session → **Save privately**. B: not in Feed or A's profile; opening its URL shows "This session is
   no longer available."
7. A: Feed → Add note → type any emoji with the keyboard → text → Share note. B sees it at the top of Feed.
8. B: Profile → ⚙︎ → Send feedback → Suggestion → send. You: SQL query in section 3 shows it.
9. A: Sign out → Forgot password? → reset email → new password → sign in.
10. Close the browser completely, reopen the site: still signed in; a running timer shows the right time.

### Physical-phone check (each platform you'll share on)

1. Site opens over HTTPS; Add to Home Screen opens it full-screen.
2. Sign-up form with the keyboard open: every field and **Create account** reachable by scrolling.
3. Start a session, lock the phone 2 minutes, unlock: timer correct; study background resumes or stays still.
4. Hold Finish with a thumb for 3 s: progress fills, gentle shake (none with Reduce Motion on), then the completion
   screen. Release early / slide your thumb off: nothing finishes. Switch apps mid-hold: nothing finishes.
5. Photo picker opens the library; upload works on mobile data.
6. Emoji keyboard: pick a skin-tone or family emoji for a note; it saves and displays.
7. Largest system text size: Profile header (name, gear), Study buttons and Feed cards don't overlap.
8. Dark mode: logo, decals on sign-up, subject colours and the hold-to-finish progress are visible.
