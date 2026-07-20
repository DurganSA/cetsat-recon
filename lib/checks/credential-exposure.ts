import { CheckResult, CheckStatus } from "../types";

// Dark web / compromised credentials via Hudson Rock's Cavalier OSINT tool
// (cavalier.hudsonrock.com) - infostealer-sourced: a machine belonging to someone at
// this domain is/was infected with credential-stealing malware. Serious and current,
// captured within days of the compromise (unlike old breach-dump aggregators).
//
// This is Hudson Rock's free, keyless public OSINT endpoint - confirmed working live
// (verified 2026-07-20) with no API key required. It's a different product from their
// paid B2B API (api.hudsonrock.com), which does require a key; that path was tried
// first and dropped when it turned out to need a key we didn't have, before this
// keyless endpoint was found to already cover the same data more richly.
//
// An IntelligenceX (leak/paste/darknet) source was previously integrated here too, but
// was dropped: IntelX's /intelligent/search endpoint returned an unresolvable 400/401
// for every request-shape variation tried across two separate accounts, and IntelX
// offers no support channel for free/trial users to diagnose it further. See git
// history (lib/checks/credential-exposure.ts pre-removal) if revisiting this.
//
// Passive only: we read indexes of already-leaked data, never test a credential
// against the target's systems.
//
// HARD RULE: report counts, categories, dates and context only. Never capture, store,
// display, or pass through actual passwords, password hashes, or the specific email
// addresses / named individuals / URLs involved. The raw API response includes
// per-record URL lists (employees_urls, clients_urls, all_urls, stats.*_urls) that can
// contain literal password-reset links with live tokens - those fields are read only
// to compute aggregate counts below and are never stored on the returned result.

export type CredentialSourceState = "ok" | "limit_reached" | "error";

export interface StealerFamilyCount {
  name: string;
  count: number;
}

export interface PasswordStrengthBreakdown {
  tooWeakPct: number;
  weakPct: number;
  mediumPct: number;
  strongPct: number;
}

export interface HudsonRockSourceResult {
  state: CredentialSourceState;
  compromisedEmployees?: number;
  compromisedUsers?: number;
  compromisedThirdParty?: number;
  // ISO timestamps of the most recent known compromise - the primary urgency signal:
  // a hit from the last few weeks is a live incident, one from years ago is historical.
  lastEmployeeCompromised?: string;
  lastUserCompromised?: string;
  topStealerFamilies?: StealerFamilyCount[];
  employeePasswordStrength?: PasswordStrengthBreakdown;
  antivirusMissingPct?: number;
  cached?: boolean;
  note: string;
}

const HUDSONROCK_TIMEOUT_MS = 25000;

// Best-effort, in-memory per-instance cache - there's no database in this project.
// Salespeople re-running the same domain while drafting a letter would otherwise burn
// through the keyless endpoint's rate limit on every re-scan. Only successful (state
// "ok") responses are cached; a limit_reached/error result is never cached as if it
// were data, so a limited source gets a genuine retry on the next scan. Like the login
// rate limiter, this resets on cold start and isn't shared across concurrent/regional
// instances - it helps the common case (re-running the same domain within a session on
// a warm instance) but is not a substitute for a real store under sustained load.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const hudsonRockCache = new Map<string, CacheEntry<HudsonRockSourceResult>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCachedIfOk<T extends { state: CredentialSourceState }>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T
): void {
  if (value.state !== "ok") return;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function isRecentIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function queryHudsonRock(domain: string): Promise<HudsonRockSourceResult> {
  try {
    const response = await fetch(
      `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-domain?domain=${encodeURIComponent(domain)}`,
      { signal: AbortSignal.timeout(HUDSONROCK_TIMEOUT_MS) }
    );

    if (response.status === 429) {
      return { state: "limit_reached", note: "Rate limit reached - not checked this run, retry later." };
    }
    if (!response.ok) {
      return { state: "error", note: `Hudson Rock query failed (${response.status}).` };
    }

    const body = await response.json();
    const employees = Number(body?.employees) || 0;
    const users = Number(body?.users) || 0;
    const thirdParties = Number(body?.third_parties) || 0;

    const lastEmployeeCompromised = isRecentIsoDate(body?.last_employee_compromised)
      ? body.last_employee_compromised
      : undefined;
    const lastUserCompromised = isRecentIsoDate(body?.last_user_compromised) ? body.last_user_compromised : undefined;

    // Aggregate malware-family counts only (no per-record identifiers) - top 3 by
    // volume is enough to name the threat without implying false precision.
    const stealerFamiliesRaw = body?.stealerFamilies;
    let topStealerFamilies: StealerFamilyCount[] | undefined;
    if (stealerFamiliesRaw && typeof stealerFamiliesRaw === "object") {
      topStealerFamilies = Object.entries(stealerFamiliesRaw as Record<string, unknown>)
        .filter(([key]) => key !== "total")
        .map(([name, count]) => ({ name, count: Number(count) || 0 }))
        .filter((f) => f.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      if (topStealerFamilies.length === 0) topStealerFamilies = undefined;
    }

    // Aggregate percentage only - never the underlying passwords.
    const employeePasswords = body?.employeePasswords;
    let employeePasswordStrength: PasswordStrengthBreakdown | undefined;
    if (employeePasswords?.has_stats) {
      employeePasswordStrength = {
        tooWeakPct: Number(employeePasswords?.too_weak?.perc) || 0,
        weakPct: Number(employeePasswords?.weak?.perc) || 0,
        mediumPct: Number(employeePasswords?.medium?.perc) || 0,
        strongPct: Number(employeePasswords?.strong?.perc) || 0
      };
    }

    const antivirusMissingPct =
      typeof body?.antiviruses?.not_found === "number" ? body.antiviruses.not_found : undefined;

    return {
      state: "ok",
      compromisedEmployees: employees,
      compromisedUsers: users,
      compromisedThirdParty: thirdParties,
      lastEmployeeCompromised,
      lastUserCompromised,
      topStealerFamilies,
      employeePasswordStrength,
      antivirusMissingPct,
      note:
        employees === 0 && users === 0
          ? "No infostealer-compromised machines found for this domain."
          : "Infostealer-sourced: indicates machine(s) infected with credential-stealing malware."
    };
  } catch (error) {
    return { state: "error", note: error instanceof Error ? error.message : String(error) };
  }
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / (24 * 60 * 60 * 1000)));
}

function mostRecentCompromiseNote(result: HudsonRockSourceResult): string {
  const dates = [result.lastEmployeeCompromised, result.lastUserCompromised].filter(isRecentIsoDate);
  if (dates.length === 0) return "";
  const mostRecent = dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const days = daysAgo(mostRecent);
  const when = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return ` Most recent compromise: ${when}.`;
}

function describeHudsonRock(result: HudsonRockSourceResult): string {
  const cachedSuffix = result.cached ? " (cached)" : "";
  switch (result.state) {
    case "ok": {
      const employees = result.compromisedEmployees ?? 0;
      const users = result.compromisedUsers ?? 0;
      if (employees === 0 && users === 0) {
        return `Hudson Rock: nothing found in infostealer logs.${cachedSuffix}`;
      }
      const parts: string[] = [];
      if (employees > 0) parts.push(`${employees} employee${employees === 1 ? "" : "s"}`);
      if (users > 0) parts.push(`${users} user${users === 1 ? "" : "s"}`);
      return `Hudson Rock: ${parts.join(", ")} in infostealer logs.${mostRecentCompromiseNote(result)}${cachedSuffix}`;
    }
    case "limit_reached":
      return "Hudson Rock: daily/rate limit reached - not checked today.";
    case "error":
    default:
      return "Hudson Rock: check failed - not checked.";
  }
}

function determineStatus(hudsonRock: HudsonRockSourceResult): CheckStatus {
  if (hudsonRock.state !== "ok") return "info";

  const hasInfostealerEmployees = (hudsonRock.compromisedEmployees ?? 0) > 0;
  if (hasInfostealerEmployees) return "action";

  const hasOtherHit = (hudsonRock.compromisedUsers ?? 0) > 0 || (hudsonRock.compromisedThirdParty ?? 0) > 0;
  if (hasOtherHit) return "review";

  return "good";
}

export async function checkCredentialExposure(domain: string): Promise<CheckResult> {
  const cacheKey = domain.toLowerCase();

  try {
    let hudsonRock = getCached(hudsonRockCache, cacheKey);
    if (hudsonRock) {
      hudsonRock = { ...hudsonRock, cached: true };
    } else {
      hudsonRock = await queryHudsonRock(domain);
      setCachedIfOk(hudsonRockCache, cacheKey, hudsonRock);
    }

    const status = determineStatus(hudsonRock);
    const hasInfostealerEmployees = hudsonRock.state === "ok" && (hudsonRock.compromisedEmployees ?? 0) > 0;
    const capability = status === "good" || status === "info" ? undefined : hasInfostealerEmployees ? "managed_security" : "human_firewall";

    return {
      id: "credential_exposure",
      label: "Dark web & compromised credentials",
      status,
      capability,
      data: {
        sources: { hudsonRock }
      },
      summary: describeHudsonRock(hudsonRock)
    };
  } catch (error) {
    return {
      id: "credential_exposure",
      label: "Dark web & compromised credentials",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check dark web / compromised credential sources."
    };
  }
}
