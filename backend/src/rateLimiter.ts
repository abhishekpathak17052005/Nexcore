import { TRPCError } from "@trpc/server";

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry) return;

  if (now > entry.resetAt) {
    rateLimitMap.delete(key);
    return;
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    const remainingSeconds = Math.ceil((entry.resetAt - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many login attempts. Please try again in ${remainingSeconds} seconds.`,
    });
  }
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { attempts: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.attempts += 1;
  }
}

export function clearRateLimit(key: string): void {
  rateLimitMap.delete(key);
}

export function resetAllRateLimits(): void {
  rateLimitMap.clear();
}
