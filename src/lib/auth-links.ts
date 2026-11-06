import { supabase } from '@/lib/supabase';

/**
 * Completes a Supabase email link (sign-up confirmation or password recovery)
 * opened on this device. Supports both the PKCE `?code=` form (our default)
 * and the implicit `#access_token=` form.
 */
export type AuthLinkResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /**
       * Supabase had already verified the email link (it only redirects with a
       * `code` after verification) but this device couldn't finish signing in —
       * typically because the link was opened in a different browser/device
       * than the one that requested it (PKCE verifier missing).
       */
      verifiedButNotSignedIn?: boolean;
    };

export async function completeAuthFromUrl(url: string | null): Promise<AuthLinkResult> {
  if (!url) return { ok: false, error: 'This link is missing information. Request a new one.' };
  const params = new URLSearchParams();
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  for (const part of [query, hash]) {
    new URLSearchParams(part).forEach((value, key) => params.set(key, value));
  }

  const errorDescription = params.get('error_description') ?? params.get('error');
  if (errorDescription) return { ok: false, error: errorDescription.replace(/\+/g, ' ') };

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? { ok: false, error: error.message, verifiedButNotSignedIn: true } : { ok: true };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  return { ok: false, error: 'This link is invalid or has expired. Request a new one.' };
}
