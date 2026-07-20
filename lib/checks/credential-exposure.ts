import { CheckResult, CheckStatus } from "../types";

// Dark web / compromised credentials, merged from two sources:
// - Hudson Rock (Cavalier): infostealer-sourced - a machine belonging to someone at
//   this domain is/was infected with credential-stealing malware. Serious and current.
// - IntelligenceX: historical breach/paste appearances of addresses on this domain.
//   Lower urgency - matters mainly where staff reuse passwords.
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

export interface IntelligenceXSourceResult {
  state: CredentialSourceState;
  leakedAddressCount?: number;
  cached?: boolean;
  note: string;
}

const HUDSONROCK_TIMEOUT_MS = 25000;
const INTELX_TIMEOUT_MS = 15000;
const INTELX_POLL_INTERVAL_MS = 1500;
const INTELX_MAX_POLLS = 6;

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
const intelligenceXCache = new Map<string, CacheEntry<IntelligenceXSourceResult>>();

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

// Two-step async flow per IntelligenceX's Search API: POST /phonebook/search returns a
// search id, then GET /phonebook/search/result is polled until status is 0 (done with
// results) or 1 (no more results). Field names for the free phonebook endpoint
// (selectorvalue/selectortypeh) are the best-documented public shape (official SDK +
// community OSINT tooling) - there is no live account available to verify against
// during this build, so this should be spot-checked against a real response once
// INTELX_API_KEY is configured, and adjusted if the live shape differs.
async function queryIntelligenceX(domain: string): Promise<IntelligenceXSourceResult> {
  const apiKey = process.env.INTELX_API_KEY;
  if (!apiKey) {
    return { state: "no_key", note: "IntelligenceX API key not configured - not checked." };
  }

  // IntelligenceX assigns each account a specific Search API instance by tier
  // (public.intelx.io for non-registered, free.intelx.io for free signed-up users,
  // 2.intelx.io for paid) - a key only works against its assigned instance, so this
  // must be overridable rather than hardcoded. Check the Developer Tab at
  // https://intelx.io/account?tab=developer for the exact host tied to your key.
  const apiRoot = `https://${process.env.INTELX_API_HOST || "free.intelx.io"}`;
  const headers: Record<string, string> = { "X-Key": apiKey };

  try {
    // Per IntelX's current OpenAPI spec, /phonebook/search takes all its parameters
    // as a query string despite being a POST - term/target/maxresults/timeout/media
    // are query params, not a JSON body (a JSON body here is for the differently
    // shaped /intelligent/search endpoint, which is not what this check uses).
    // target=0 ("All") keeps this broad; results are still filtered to this exact
    // @domain match after fetching.
    const searchParams = new URLSearchParams({
      term: domain,
      target: "0",
      maxresults: "100",
      timeout: "10",
      media: "0"
    });

    const searchResponse = await fetch(`${apiRoot}/phonebook/search?${searchParams.toString()}`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(INTELX_TIMEOUT_MS)
    });

    // 402 Payment Required is the documented signal for an exhausted daily search
    // credit on this API - the exact daily allowance is account-specific and not
    // published, so exhaustion is detected from the response rather than a hard-coded
    // count.
    if (searchResponse.status === 402) {
      return { state: "limit_reached", note: "Daily search credit reached - not checked today, retry tomorrow." };
    }
    if (searchResponse.status === 429) {
      return { state: "limit_reached", note: "Rate limit reached - not checked this run, retry later." };
    }
    if (searchResponse.status === 401) {
      return { state: "error", note: "IntelligenceX rejected the configured API key." };
    }
    if (!searchResponse.ok) {
      return { state: "error", note: `IntelligenceX search failed (${searchResponse.status}).` };
    }

    const searchBody = await searchResponse.json();
    const searchId = searchBody?.id;
    if (!searchId) {
      return { state: "error", note: "IntelligenceX search did not return a search id." };
    }

    const selectors: any[] = [];
    for (let attempt = 0; attempt < INTELX_MAX_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, INTELX_POLL_INTERVAL_MS));

      // /phonebook/search/result's limit query param is named "l", not "limit".
      const resultResponse = await fetch(
        `${apiRoot}/phonebook/search/result?id=${encodeURIComponent(searchId)}&l=100`,
        { headers, signal: AbortSignal.timeout(INTELX_TIMEOUT_MS) }
      );

      if (resultResponse.status === 402) {
        return { state: "limit_reached", note: "Daily search credit reached - not checked today, retry tomorrow." };
      }
      if (!resultResponse.ok) {
        return { state: "error", note: `IntelligenceX result fetch failed (${resultResponse.status}).` };
      }

      const resultBody = await resultResponse.json();
      const pageSelectors: any[] = Array.isArray(resultBody?.selectors) ? resultBody.selectors : [];
      selectors.push(...pageSelectors);

      // status: 0 = success with results, 1 = no more results, 3 = not ready yet
      // (keep polling), anything else = stop rather than loop indefinitely.
      if (resultBody?.status === 0 || resultBody?.status === 1) break;
      if (resultBody?.status !== 3) break;
    }

    // Require an actual @domain match rather than trusting the selector-type label
    // alone (field name/shape unverified against a live account) - a mislabeled or
    // off-domain selector must never inflate this domain's count.
    const addresses = new Set<string>();
    for (const selector of selectors) {
      const value = typeof selector?.selectorvalue === "string" ? selector.selectorvalue : undefined;
      if (!value || !value.includes("@")) continue;
      if (value.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
        addresses.add(value.toLowerCase());
      }
    }

    return {
      state: "ok",
      leakedAddressCount: addresses.size,
      note:
        addresses.size === 0
          ? "No addresses on this domain found in indexed leak/paste sources."
          : "Leak/paste appearance - lower urgency than an active infostealer hit; matters mainly where staff reuse passwords."
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

function describeIntelligenceX(result: IntelligenceXSourceResult): string {
  const cachedSuffix = result.cached ? " (cached)" : "";
  switch (result.state) {
    case "ok": {
      const count = result.leakedAddressCount ?? 0;
      return count === 0
        ? `IntelligenceX: nothing found in breach/paste sources.${cachedSuffix}`
        : `IntelligenceX: ${count} address${count === 1 ? "" : "es"} found in breach/paste sources.${cachedSuffix}`;
    }
    case "limit_reached":
      return "IntelligenceX: daily credit reached - not checked today, retry tomorrow.";
    case "no_key":
      return "IntelligenceX: no API key configured - not checked.";
    case "error":
    default:
      return "IntelligenceX: check failed - not checked.";
  }
}

function determineStatus(hudsonRock: HudsonRockSourceResult, intelligenceX: IntelligenceXSourceResult): CheckStatus {
  const hasInfostealerEmployees = hudsonRock.state === "ok" && (hudsonRock.compromisedEmployees ?? 0) > 0;
  if (hasInfostealerEmployees) return "action";

  const hasOtherHudsonRockHit =
    hudsonRock.state === "ok" &&
    ((hudsonRock.compromisedUsers ?? 0) > 0 || (hudsonRock.compromisedThirdParty ?? 0) > 0);
  const hasLeakHit = intelligenceX.state === "ok" && (intelligenceX.leakedAddressCount ?? 0) > 0;
  if (hasOtherHudsonRockHit || hasLeakHit) return "review";

  // Both sources genuinely queried and both came back empty - the only case that
  // earns "good". Any other combination (including "one clean, one unavailable")
  // falls through to "info": we never let incomplete coverage read as a clean result.
  if (hudsonRock.state === "ok" && intelligenceX.state === "ok") return "good";

  return "info";
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

    let intelligenceX = getCached(intelligenceXCache, cacheKey);
    if (intelligenceX) {
      intelligenceX = { ...intelligenceX, cached: true };
    } else {
      intelligenceX = await queryIntelligenceX(domain);
      setCachedIfOk(intelligenceXCache, cacheKey, intelligenceX);
    }

    const status = determineStatus(hudsonRock, intelligenceX);
    const hasInfostealerEmployees = hudsonRock.state === "ok" && (hudsonRock.compromisedEmployees ?? 0) > 0;
    const capability = status === "good" || status === "info" ? undefined : hasInfostealerEmployees ? "managed_security" : "human_firewall";

    const totalsAvailable = !(hudsonRock.state === "ok" && hudsonRock.truncated);

    return {
      id: "credential_exposure",
      label: "Dark web & compromised credentials",
      status,
      capability,
      data: {
        sources: { hudsonRock, intelligenceX },
        totalsAvailable
      },
      summary: `${describeHudsonRock(hudsonRock)}\n${describeIntelligenceX(intelligenceX)}`
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
