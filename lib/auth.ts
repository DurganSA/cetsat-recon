// Edge-runtime-compatible auth helpers: signed session cookie (Web Crypto HMAC) and a
// single shared app password, since this is a small internal tool with no database.

export const SESSION_COOKIE_NAME = "cetsat_session";

// Absolute cap enforced server-side even though the cookie itself is a browser-session
// cookie (no Max-Age) - defense-in-depth in case a browser restores the session longer
// than expected.
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Fixed-length comparison so neither a length difference nor an early mismatch changes
// timing. Callers pass equal-length hex digests (SHA-256/HMAC-SHA256 output) so this
// never leaks the true secret length either.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSignHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bufferToHex(signature);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bufferToHex(digest);
}

export async function createSessionToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");

  const issuedAt = Date.now().toString();
  const signature = await hmacSignHex(issuedAt, secret);
  return `${issuedAt}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return false;

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const expectedSignature = await hmacSignHex(issuedAt, secret);
  if (!constantTimeEqual(signature, expectedSignature)) return false;

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (Date.now() - issuedAtMs > SESSION_MAX_AGE_MS) return false;

  return true;
}

// Hash both sides to fixed-length digests before comparing, so the comparison itself
// never has to branch on the raw password's length.
export async function verifyPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false; // misconfigured - deny by default, never implicitly allow

  const [candidateHash, expectedHash] = await Promise.all([sha256Hex(candidate), sha256Hex(expected)]);
  return constantTimeEqual(candidateHash, expectedHash);
}

interface AttemptRecord {
  count: number;
  windowStart: number;
}

// Best-effort, in-memory per-instance limiter - there's no database in this project.
// It resets on cold start and isn't shared across concurrent/regional instances, so it
// won't stop a distributed attacker, but it does stop a naive single-source brute force
// script, and the login delay below adds friction even within one warm instance.
const attemptsByIp = new Map<string, AttemptRecord>();

function pruneExpiredAttempts(now: number): void {
  if (attemptsByIp.size < 1000) return;
  for (const [ip, record] of attemptsByIp) {
    if (now - record.windowStart > LOGIN_ATTEMPT_WINDOW_MS) {
      attemptsByIp.delete(ip);
    }
  }
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = attemptsByIp.get(ip);

  if (!record || now - record.windowStart > LOGIN_ATTEMPT_WINDOW_MS) {
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((record.windowStart + LOGIN_ATTEMPT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

export function recordFailedAttempt(ip: string): number {
  const now = Date.now();
  pruneExpiredAttempts(now);

  const record = attemptsByIp.get(ip);
  if (!record || now - record.windowStart > LOGIN_ATTEMPT_WINDOW_MS) {
    attemptsByIp.set(ip, { count: 1, windowStart: now });
    return 1;
  }

  record.count += 1;
  return record.count;
}

export function resetRateLimit(ip: string): void {
  attemptsByIp.delete(ip);
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
