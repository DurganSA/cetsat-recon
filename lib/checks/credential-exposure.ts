import { CheckResult, CheckStatus } from "../types";

// Dark web / compromised credentials, merged from two sources:
// - Hudson Rock (Cavalier): infostealer-sourced - a machine belonging to someone at
//   this domain is/was infected with credential-stealing malware. Serious and current.
// - IntelligenceX: historical breach/paste/darknet records mentioning this domain.
//   Lower urgency - matters mainly where staff reuse passwords. Uses the Selector
//   Search endpoint (/intelligent/search), which is available on the Free tier -
//   Phonebook Lookups (a cleaner deduplicated-address signal) require at least an
//   Academia or paid IntelX plan, so this deliberately reports a record-match count
//   rather than a precise leaked-address count.
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
  matchingRecordCount?: number;
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

// IntelX's date params use "YYYY-mm-dd HH:ii:ss" (not RFC3339).
function formatIntelXDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

// Two-step async flow per IntelX's Search API: POST /intelligent/search returns a
// search id, then GET /intelligent/search/result is polled until status is 0 (success
// with results) or 1 (no more results). This uses /intelligent/search rather than
// /phonebook/search deliberately - Phonebook Lookups (a cleaner deduplicated
// leaked-address signal) are unavailable on IntelX's Free tier per their pricing page
// (https://intelx.io/product), while Selector Search / /intelligent/search is
// available (fair-use). The tradeoff: this returns matching leak/paste/darknet
// records, not a clean list of addresses, so the count reported is "records mentioning
// this domain" rather than "distinct leaked addresses" - a real, disclosed reduction
// in precision to keep this source usable on a Free-tier key.
//
// Auth: both calls use the X-Key header, matching the official Python SDK
// (github.com/IntelligenceX/SDK/Python/intelx/intelxapi.py) rather than the
// auto-generated openapi.yaml in the same repo, which incorrectly documents these as
// query parameters - the actively-maintained reference client's request shape is the
// one that actually works.
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
  const headers: Record<string, string> = { "X-Key": apiKey, "content-type": "application/json" };

  try {
    const now = new Date();
    // Field names/order match the official SDK's INTEL_SEARCH exactly - sent as a
    // JSON body, not query params, despite the openapi.yaml's (incorrect) docs.
    const searchResponse = await fetch(`${apiRoot}/intelligent/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        term: domain,
        buckets: [],
        lookuplevel: 0,
        maxresults: 50,
        timeout: 20,
        // Broad historical range - IntelX's archive goes back years and newly
        // indexed items are often backdated, so a narrow recent window would miss
        // real hits.
        datefrom: "2000-01-01 00:00:00",
        dateto: formatIntelXDate(now),
        sort: 4, // newest first
        media: 0,
        terminate: []
      }),
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
      // IntelX's own error text is safe to surface (it's about the request shape, not
      // any leaked data) and is far more useful for debugging than the status alone.
      const errorText = await searchResponse.text().catch(() => "");
      const detail = errorText ? ` ${errorText.slice(0, 200)}` : "";
      return { state: "error", note: `IntelligenceX search failed (${searchResponse.status}).${detail}` };
    }

    const searchBody = await searchResponse.json();
    // Per the official SDK, the initial POST can return status:1 (no results) with no
    // id at all, when there's nothing to poll for - that's a genuine "ok, zero
    // results", not a missing-id error.
    if (searchBody?.status === 1) {
      return { state: "ok", matchingRecordCount: 0, note: "No leak/paste/darknet records mentioning this domain found." };
    }
    const searchId = searchBody?.id;
    if (!searchId) {
      return { state: "error", note: "IntelligenceX search did not return a search id." };
    }

    const records: any[] = [];
    for (let attempt = 0; attempt < INTELX_MAX_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, INTELX_POLL_INTERVAL_MS));

      // /intelligent/search/result only takes id + limit as query params per the
      // official SDK - auth is via the X-Key header, same as the initial search.
      const resultResponse = await fetch(
        `${apiRoot}/intelligent/search/result?id=${encodeURIComponent(searchId)}&limit=100`,
        { headers: { "X-Key": apiKey }, signal: AbortSignal.timeout(INTELX_TIMEOUT_MS) }
      );

      if (resultResponse.status === 402) {
        return { state: "limit_reached", note: "Daily search credit reached - not checked today, retry tomorrow." };
      }
      if (!resultResponse.ok) {
        const errorText = await resultResponse.text().catch(() => "");
        const detail = errorText ? ` ${errorText.slice(0, 200)}` : "";
        return { state: "error", note: `IntelligenceX result fetch failed (${resultResponse.status}).${detail}` };
      }

      const resultBody = await resultResponse.json();
      const pageRecords: any[] = Array.isArray(resultBody?.records) ? resultBody.records : [];
      records.push(...pageRecords);

      // status: 0 = success with results (continue polling, more may exist), 1 = no
      // more results, 3 = not ready yet (keep polling), anything else (2 = search id
      // not found, 4 = error) = stop rather than loop indefinitely.
      if (resultBody?.status === 0 || resultBody?.status === 1) break;
      if (resultBody?.status !== 3) break;
    }

    return {
      state: "ok",
      matchingRecordCount: records.length,
      note:
        records.length === 0
          ? "No leak/paste/darknet records mentioning this domain found."
          : "Leak/paste/darknet record mention - lower urgency than an active infostealer hit; matters mainly where staff reuse passwords. Reflects matching records, not a deduplicated address count."
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
      const count = result.matchingRecordCount ?? 0;
      return count === 0
        ? `IntelligenceX: nothing found in leak/paste/darknet sources.${cachedSuffix}`
        : `IntelligenceX: ${count} record${count === 1 ? "" : "s"} mentioning this domain in leak/paste/darknet sources.${cachedSuffix}`;
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
  const hasLeakHit = intelligenceX.state === "ok" && (intelligenceX.matchingRecordCount ?? 0) > 0;
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
