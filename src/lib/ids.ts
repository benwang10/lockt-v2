import * as Crypto from 'expo-crypto';

/** RFC 4122 v4 UUID used for client-generated ids (idempotent retries). */
export function randomId(): string {
  return Crypto.randomUUID();
}
