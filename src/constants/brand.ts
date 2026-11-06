/**
 * Product naming lives here so the name is easy to change.
 * APP_NAME is the user-facing display name (also "name" in app.json).
 * Internal identifiers intentionally still use "studylog" (app.json slug,
 * deep-link scheme, bundle ids, storage keys) — changing those breaks
 * existing deep links / redirect allow-lists and is not needed for a rename.
 */
export const APP_NAME = 'Lockt';
export const APP_TAGLINE = 'Your social study journal';
/** Deep-link scheme (internal identifier); must match "scheme" in app.json. */
export const APP_SCHEME = 'studylog';
