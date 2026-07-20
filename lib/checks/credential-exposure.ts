import { CheckResult, CheckStatus } from "../types";

// Dark web / compromised credentials via Hudson Rock (Cavalier): infostealer-sourced -
// a machine belonging to someone at this domain is/was infected with
// credential-stealing malware. Serious and current.
//
// An IntelligenceX (leak/paste/darknet) source was previously integrated here too, but
// was dropped: IntelX's /intelligent/search endpoint returned an unresolvable 400/401
// for every request-shape variation tried (query params, JSON body matching their
// official SDK exactly, every combination of the "buckets" field, across two separate
// accounts), and IntelX offers no support channel for free/trial users to diagnose it.
// See git history (lib/checks/credential-exposure.ts pre-removal) if revisiting this.
//
// Passive only: we read indexes of already-leaked data, never test a credential
// against the target's systems.
//
// HARD RULE: report counts, categories and context only. Never capture, store,
// display, or pass through actual passwords, password hashes, or the specific email
// addresses / named individuals involved. Any per-record identifier from an API
// response is used only transiently in-memory to de-duplicate a count, then discarded -
// it never appears in the returned data, logs, or report.

export type CredentialSourceState = "ok" | "limit_reached" | "no_key" | "error";

export interface HudsonRockSourceResult {
  state: CredentialSourceState;
  compromisedEmployees?: number;
  compromisedUsers?: number;
  compromisedThirdParty?: number;
  stealerCount?: number;
  truncated?: boolean;
  cached?: boolean;
  note: string;
}

const HUDSONROCK_TIMEOUT_MS = 25000;

// Best-effort, in-memory per-instance cache - there's no database in this project.
// Salespeople re-running the same domain while drafting a letter would otherwise burn
// through the free daily credit on every re-scan. Only successful (state "ok")
// responses are cached; a limit_reached/no_key/error result is never cached as if it
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

// The live docs show an `api-key` header on every example request, including the most
// basic single-domain search - this looks to have become required in practice, not the
// keyless "Cavalier free" behaviour this check was originally scoped around. Built so
// the key is used when present, but the call is still attempted without one; the
// response itself (401/403) is the source of truth on whether it's actually required.
async function queryHudsonRock(domain: string): Promise<HudsonRockSourceResult> {
  const apiKey = process.env.HUDSONROCK_API_KEY;

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json"
    };
    if (apiKey) headers["api-key"] = apiKey;

    const response = await fetch("https://api.hudsonrock.com/json/v3/search-by-domain", {
      method: "POST",
      headers,
      // Deliberately omit "types" - filtering by type requires extra permission scopes
      // a free key may not carry, and we can derive the employee/user/third_party
      // breakdown ourselves from the returned credentials array.
      body: JSON.stringify({ domains: [domain] }),
      signal: AbortSignal.timeout(HUDSONROCK_TIMEOUT_MS)
    });

    if (response.status === 429) {
      return { state: "limit_reached", note: "Rate limit reached - not checked this run, retry later." };
    }
    if (response.status === 401 || response.status === 403) {
      return apiKey
        ? { state: "error", note: "Hudson Rock rejected the configured API key." }
        : { state: "no_key", note: "Hudson Rock now requires an API key for this endpoint - not checked." };
    }
    if (!response.ok) {
      return { state: "error", note: `Hudson Rock query failed (${response.status}).` };
    }

    const body = await response.json();
    const stealers: any[] = Array.isArray(body?.data) ? body.data : [];

    const employeeUsernames = new Set<string>();
    const userUsernames = new Set<string>();
    const thirdPartyUsernames = new Set<string>();

    for (const stealer of stealers) {
      const credentials: any[] = Array.isArray(stealer?.credentials) ? stealer.credentials : [];
      for (const credential of credentials) {
        const username = typeof credential?.username === "string" ? credential.username : undefined;
        if (!username) continue;
        if (credential.type === "employee") employeeUsernames.add(username);
        else if (credential.type === "user") userUsernames.add(username);
        else if (credential.type === "third_party") thirdPartyUsernames.add(username);
      }
    }

    const truncated = Boolean(body?.nextCursor);

    return {
      state: "ok",
      compromisedEmployees: employeeUsernames.size,
      compromisedUsers: userUsernames.size,
      compromisedThirdParty: thirdPartyUsernames.size,
      stealerCount: stealers.length,
      truncated,
      note:
        stealers.length === 0
          ? "No infostealer-compromised machines found for this domain."
          : "Infostealer-sourced: indicates machine(s) infected with credential-stealing malware." +
            (truncated ? " More results exist beyond this page - counts are a floor, not a total." : "")
    };
  } catch (error) {
    return { state: "error", note: error instanceof Error ? error.message : String(error) };
  }
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
      const truncatedSuffix = result.truncated ? "+" : "";
      return `Hudson Rock: ${parts.join(", ")}${truncatedSuffix} in infostealer logs.${cachedSuffix}`;
    }
    case "limit_reached":
      return "Hudson Rock: daily/rate limit reached - not checked today.";
    case "no_key":
      return "Hudson Rock: no API key configured - not checked.";
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

    const totalsAvailable = !(hudsonRock.state === "ok" && hudsonRock.truncated);

    return {
      id: "credential_exposure",
      label: "Dark web & compromised credentials",
      status,
      capability,
      data: {
        sources: { hudsonRock },
        totalsAvailable
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
