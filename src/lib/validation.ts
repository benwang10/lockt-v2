/**
 * Client-side validation. Every rule here is also enforced by a database
 * constraint or bucket setting; these exist to give fast, friendly feedback.
 */

export const LIMITS = {
  usernameMin: 3,
  usernameMax: 20,
  displayName: 50,
  bio: 160,
  subjectName: 40,
  intention: 280,
  title: 80,
  accomplishment: 2000,
  songTitle: 120,
  songArtist: 120,
  songUrl: 500,
  comment: 500,
  goalTitle: 80,
  photoBytes: 5 * 1024 * 1024,
  avatarBytes: 2 * 1024 * 1024,
} as const;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function validateUsername(input: string): string | null {
  const u = normalizeUsername(input);
  if (u.length < LIMITS.usernameMin) return `At least ${LIMITS.usernameMin} characters.`;
  if (u.length > LIMITS.usernameMax) return `At most ${LIMITS.usernameMax} characters.`;
  if (!/^[a-z0-9_]+$/.test(u)) return 'Use only letters, numbers and underscores.';
  return null;
}

export function validateDisplayName(input: string): string | null {
  const v = input.trim();
  if (v.length === 0) return 'Add a display name.';
  if (v.length > LIMITS.displayName) return `At most ${LIMITS.displayName} characters.`;
  return null;
}

export function validateEmail(input: string): string | null {
  const v = input.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(input: string): string | null {
  if (input.length < 8) return 'Use at least 8 characters.';
  return null;
}

const SUPPORTED_MUSIC_HOSTS = ['open.spotify.com', 'spotify.link', 'music.apple.com', 'geo.music.apple.com'];

export type MusicService = 'spotify' | 'apple_music';

/** Returns the service for a supported https music link, or null. */
export function detectMusicService(url: string): MusicService | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  if (!SUPPORTED_MUSIC_HOSTS.includes(host)) return null;
  return host.includes('spotify') ? 'spotify' : 'apple_music';
}

export function validateSongUrl(url: string): string | null {
  const v = url.trim();
  if (v.length === 0) return null;
  if (v.length > LIMITS.songUrl) return 'That link is too long.';
  if (/\s/.test(v)) return 'Links cannot contain spaces.';
  if (!detectMusicService(v)) return 'Paste an https link from open.spotify.com or music.apple.com.';
  // The database regex requires a path after the host.
  if (!/^https:\/\/[^/]+\/.*/.test(v)) return 'Paste the full link to a song.';
  return null;
}

export function validateSong(song: { title: string; artist: string; url: string }): string | null {
  const hasAny = song.title.trim() || song.artist.trim() || song.url.trim();
  if (!hasAny) return null;
  if (!song.title.trim()) return 'Add the song title (or clear the song).';
  if (song.title.trim().length > LIMITS.songTitle) return 'Song title is too long.';
  if (song.artist.trim().length > LIMITS.songArtist) return 'Artist name is too long.';
  return validateSongUrl(song.url);
}

export function validateSubjectColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export function validateImage(file: { mimeType?: string | null; fileSize?: number | null }, maxBytes: number): string | null {
  if (file.mimeType && !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
    return 'Use a JPEG, PNG or WebP image.';
  }
  if (file.fileSize != null && file.fileSize > maxBytes) {
    return `Images must be under ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  }
  return null;
}
