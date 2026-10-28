import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export interface HashResult {
  hash: string;
  salt: string;
}

/**
 * Hash a password using scrypt with a cryptographically secure random salt.
 */
export function hashPassword(password: string): HashResult {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  if (password.length > 128) {
    throw new Error("Password must not exceed 128 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return {
    hash: derivedKey.toString("hex"),
    salt,
  };
}

/**
 * Verify a candidate password against an existing hash and salt in constant time.
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash || !salt) return false;
  try {
    const keyBuffer = Buffer.from(hash, "hex");
    const candidateBuffer = scryptSync(password, salt, KEY_LENGTH);
    if (keyBuffer.length !== candidateBuffer.length) return false;
    return timingSafeEqual(keyBuffer, candidateBuffer);
  } catch {
    return false;
  }
}

/**
 * Normalize email to lowercase and trimmed.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
