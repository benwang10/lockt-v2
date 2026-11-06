import { FOREST_GREEN, subjectColorOr } from '../../constants/theme';
import { friendlyError, isNetworkError } from '../errors';
import {
  detectMusicService,
  validateImage,
  validateSong,
  validateSongUrl,
  validateUsername,
} from '../validation';

describe('validation', () => {
  test('usernames', () => {
    expect(validateUsername('ab')).not.toBeNull();
    expect(validateUsername('Study_Bud')).toBeNull(); // normalised to lower case
    expect(validateUsername('no spaces')).not.toBeNull();
    expect(validateUsername('a'.repeat(21))).not.toBeNull();
  });

  test('music links', () => {
    expect(detectMusicService('https://open.spotify.com/track/abc')).toBe('spotify');
    expect(detectMusicService('https://music.apple.com/us/album/x/1')).toBe('apple_music');
    expect(detectMusicService('http://open.spotify.com/track/abc')).toBeNull();
    expect(detectMusicService('https://open.spotify.com.evil.io/x')).toBeNull();
    expect(validateSongUrl('')).toBeNull();
    expect(validateSongUrl('https://youtube.com/watch?v=1')).not.toBeNull();
  });

  test('song requires a title when an artist or link is present', () => {
    expect(validateSong({ title: '', artist: '', url: '' })).toBeNull();
    expect(validateSong({ title: '', artist: 'Someone', url: '' })).not.toBeNull();
    expect(validateSong({ title: 'Song', artist: '', url: 'https://open.spotify.com/track/1' })).toBeNull();
  });

  test('images', () => {
    expect(validateImage({ mimeType: 'image/gif', fileSize: 10 }, 1000)).not.toBeNull();
    expect(validateImage({ mimeType: 'image/jpeg', fileSize: 2000 }, 1000)).not.toBeNull();
    expect(validateImage({ mimeType: 'image/jpeg', fileSize: 10 }, 1000)).toBeNull();
  });
});

describe('errors', () => {
  test('network errors are recognised and described honestly', () => {
    const err = new TypeError('Network request failed');
    expect(isNetworkError(err)).toBe(true);
    expect(friendlyError(err)).toMatch(/Can't reach the server/);
  });

  test('server error codes map to friendly text', () => {
    expect(friendlyError({ message: 'active_session_exists', code: 'P0001' })).toMatch(/already have a session/);
    expect(friendlyError({ message: 'x', code: '42501' })).toMatch(/permission/);
  });
});

describe('subject colour fallback', () => {
  test('valid hex colours are kept', () => {
    expect(subjectColorOr('#5B5BD6', FOREST_GREEN)).toBe('#5B5BD6');
  });
  test('missing or invalid colours fall back to forest green', () => {
    for (const bad of [null, undefined, '', 'red', '#12345', '#GGGGGG', 'rgb(0,0,0)']) {
      expect(subjectColorOr(bad, FOREST_GREEN)).toBe('#0B6E5F');
    }
  });
});
