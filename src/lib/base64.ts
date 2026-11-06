const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

/** Decode base64 to an exact-length ArrayBuffer (what supabase-js uploads expect on React Native). */
export function base64ToArrayBuffer(input: string): ArrayBuffer {
  const bytes = decodeBase64(input);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Decode base64 to bytes without relying on platform atob/Buffer. */
export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(length);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = LOOKUP[clean.charCodeAt(i + 2)];
    const d = LOOKUP[clean.charCodeAt(i + 3)];
    if (p < length) bytes[p++] = (a << 2) | (b >> 4);
    if (p < length) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < length) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}
