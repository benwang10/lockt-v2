import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { base64ToArrayBuffer } from '@/lib/base64';
import { randomId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { LIMITS, validateImage } from '@/lib/validation';

export type Bucket = 'session-photos' | 'avatars';

/** A locally picked + compressed image ready to upload. */
export type PreparedImage = {
  /** Stable id chosen at pick time so a retried upload overwrites, not duplicates. */
  id: string;
  previewUri: string;
  base64: string;
  mimeType: 'image/jpeg';
  bytes: number;
};

/**
 * Opens the photo library (no camera), then resizes/compresses to JPEG.
 * Returns null if the user cancelled.
 */
export async function pickImage(opts: { maxDimension: number; maxBytes: number; square?: boolean }): Promise<PreparedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: !!opts.square,
    aspect: opts.square ? [1, 1] : undefined,
    quality: 1,
    selectionLimit: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width || 0, asset.height || 0);
  if (longest > opts.maxDimension) {
    if ((asset.width || 0) >= (asset.height || 0)) context.resize({ width: opts.maxDimension });
    else context.resize({ height: opts.maxDimension });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error("Couldn't process that image. Try another one.");

  const bytes = Math.floor((saved.base64.length * 3) / 4);
  const problem = validateImage({ mimeType: 'image/jpeg', fileSize: bytes }, opts.maxBytes);
  if (problem) throw new Error(problem);

  return { id: randomId(), previewUri: saved.uri, base64: saved.base64, mimeType: 'image/jpeg', bytes };
}

export function pickSessionPhoto() {
  return pickImage({ maxDimension: 1600, maxBytes: LIMITS.photoBytes });
}

export function pickAvatar() {
  return pickImage({ maxDimension: 512, maxBytes: LIMITS.avatarBytes, square: true });
}

export function sessionPhotoPath(userId: string, sessionId: string, image: PreparedImage) {
  return `${userId}/${sessionId}/${image.id}.jpg`;
}

export function avatarPath(userId: string, image: PreparedImage) {
  return `${userId}/${image.id}.jpg`;
}

export async function uploadImage(bucket: Bucket, path: string, image: PreparedImage): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(path, base64ToArrayBuffer(image.base64), {
    contentType: image.mimeType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw error;
}

export async function removeObject(bucket: Bucket, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
  signedUrlCache.delete(`${bucket}/${path}`);
}

// ---------------------------------------------------------------------------
// Signed URLs (buckets are private). Short-lived so revoked access (unfollow,
// visibility change) stops working quickly even for already-issued links.
// ---------------------------------------------------------------------------

const SIGNED_URL_TTL_SECONDS = 600;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

export function getCachedSignedUrl(bucket: Bucket, path: string): string | null {
  const hit = signedUrlCache.get(`${bucket}/${path}`);
  return hit && hit.expiresAt - Date.now() > 60_000 ? hit.url : null;
}

export async function getSignedUrl(bucket: Bucket, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const cached = getCachedSignedUrl(bucket, path);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = (async () => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    signedUrlCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
    return data.signedUrl;
  })().finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** Drops a cached signed URL, e.g. once access to the session that owns it is lost. */
export function forgetSignedUrl(bucket: Bucket, path: string) {
  signedUrlCache.delete(`${bucket}/${path}`);
}

export function clearSignedUrlCache() {
  signedUrlCache.clear();
}
