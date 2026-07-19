import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  checkRateLimit,
  createSessionToken,
  getClientIp,
  recordFailedAttempt,
  resetRateLimit,
  verifyPassword,
} from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    console.error("Login attempted but APP_PASSWORD/SESSION_SECRET is not configured");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 900) } }
    );
  }

  let password: unknown;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  const isValid = await verifyPassword(password);
  if (!isValid) {
    const attemptCount = recordFailedAttempt(ip);
    // Small increasing delay slows a scripted brute-force loop even within one warm
    // instance, on top of the hard lockout once the window's attempt cap is hit.
    const delayMs = Math.min(attemptCount * 300, 3000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  resetRateLimit(ip);

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // Deliberately no maxAge/expires - a true browser-session cookie that clears when
    // the browser fully closes, per project requirement.
  });
  return response;
}
