import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { requireMongoDb } from "./mongo";

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LOCAL_KEYS = 10_000;
const LOCAL_CLEANUP_EVERY = 100;
let localOperations = 0;

function pruneLocalEntries(now: number) {
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt <= now) rateLimitMap.delete(key);
  }
  while (rateLimitMap.size > MAX_LOCAL_KEYS) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey === undefined) break;
    rateLimitMap.delete(oldestKey);
  }
}

function localConsume(key: string) {
  const now = Date.now();
  if (++localOperations % LOCAL_CLEANUP_EVERY === 0 || rateLimitMap.size >= MAX_LOCAL_KEYS) {
    pruneLocalEntries(now);
  }
  const entry = rateLimitMap.get(key);
  if (entry && entry.resetAt > now && entry.attempts >= MAX_ATTEMPTS) {
    throw rateLimitError(entry.resetAt - now);
  }
  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(key, { attempts: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.attempts += 1;
  }
}

function rateLimitError(remainingMs: number) {
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `Too many requests. Please try again in ${remainingSeconds} seconds.`,
  });
}

function storageKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** Atomically consumes an attempt in MongoDB so limits are shared by app instances. */
export async function consumeRateLimit(key: string): Promise<void> {
  if (!process.env.MONGODB_URI) {
    localConsume(key);
    return;
  }

  const db = await requireMongoDb();
  const limits = db.collection<{ _id: string; attempts: number; resetAt: Date }>("rateLimits");
  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MS);
  const id = storageKey(key);
  const filter = { _id: id };
  const update = [{
      $set: {
        attempts: {
          $cond: [
            { $gt: ["$resetAt", now] },
            { $min: [MAX_ATTEMPTS + 1, { $add: [{ $ifNull: ["$attempts", 0] }, 1] }] },
            1,
          ],
        },
        resetAt: { $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", windowEnd] },
      },
    }];
  try {
    await limits.updateOne(filter, update, { upsert: true });
  } catch (error) {
    // Concurrent first attempts can race to insert the same hashed key.
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11000) throw error;
    await limits.updateOne(filter, update);
  }

  const entry = await limits.findOne(filter);
  if (!entry) throw new Error("Rate limit counter could not be read after update.");
  if (entry.attempts > MAX_ATTEMPTS) throw rateLimitError(entry.resetAt.getTime() - Date.now());
}

/** In-memory inspection helper retained for isolated unit tests. */
export function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry) return;

  if (now >= entry.resetAt) {
    rateLimitMap.delete(key);
    return;
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    throw rateLimitError(entry.resetAt - now);
  }
}

/** In-memory helper retained for isolated unit tests. */
export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  if (++localOperations % LOCAL_CLEANUP_EVERY === 0 || rateLimitMap.size >= MAX_LOCAL_KEYS) {
    pruneLocalEntries(now);
  }
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    if (rateLimitMap.size >= MAX_LOCAL_KEYS) pruneLocalEntries(now);
    rateLimitMap.set(key, { attempts: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.attempts += 1;
  }
}

/** In-memory helper retained for isolated unit tests. */
export function clearRateLimit(key: string): void {
  rateLimitMap.delete(key);
}

export async function clearDistributedRateLimit(key: string): Promise<void> {
  rateLimitMap.delete(key);
  if (process.env.MONGODB_URI) {
    const db = await requireMongoDb();
    await db.collection<{ _id: string; attempts: number; resetAt: Date }>("rateLimits").deleteOne({ _id: storageKey(key) });
  }
}

export function resetAllRateLimits(): void {
  rateLimitMap.clear();
}
