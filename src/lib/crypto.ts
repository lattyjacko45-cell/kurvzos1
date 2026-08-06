import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM helpers for secrets at rest (currently the YouTube refresh
 * token). Server-only: this module must never be imported from a client
 * component.
 *
 * Stored format: base64(iv):base64(authTag):base64(ciphertext)
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("YOUTUBE_TOKEN_ENCRYPTION_KEY is not set or is not a 32-byte base64 key.");
    this.name = "MissingEncryptionKeyError";
  }
}

function getKey(): Buffer {
  const raw = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new MissingEncryptionKeyError();

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) throw new MissingEncryptionKeyError();

  return key;
}

/** True when a usable key is configured, without throwing. */
export function hasEncryptionKey(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(":");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed encrypted payload");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivPart, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time compare for OAuth state values. */
export function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
