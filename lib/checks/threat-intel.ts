import { CheckResult } from "../types";
import { findRegisteredLookalikes, LookalikeCandidate } from "./lookalike";

// Free threat-intel sources - no data here means "not currently flagged", not "guaranteed clean".
// Each sub-check degrades independently: a missing key or a dead endpoint should never
// take down the whole check, it just gets listed as an "unchecked" source in the summary.

const FETCH_TIMEOUT_MS = 10000;

// None of these third-party APIs are guaranteed to respond quickly (or at all), and this
// check makes more external calls than any other single check in the app. A hard timeout
// per request keeps one flaky endpoint from stalling the whole scan.
function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function checkOTX(domain: string): Promise<{ pulseCount: number; pulses: string[]; error?: string }> {
  const apiKey = process.env.OTX_API_KEY;
  if (!apiKey) {
    return { pulseCount: 0, pulses: [], error: "API key not configured" };
  }

  try {
    const response = await fetchWithTimeout(
      `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/general`,
      { headers: { "X-OTX-API-KEY": apiKey } }
    );
    if (!response.ok) throw new Error(`OTX query failed (${response.status})`);

    const data = await response.json();
    const pulses = (data.pulse_info?.pulses || []).map((p: any) => p.name).slice(0, 5);
    const pulseCount = data.pulse_info?.count ?? pulses.length;

    return { pulseCount, pulses };
  } catch (error) {
    return { pulseCount: 0, pulses: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkURLhaus(domain: string): Promise<{ found: boolean; urls: string[]; error?: string }> {
  const authKey = process.env.URLHAUS_AUTH_KEY;
  if (!authKey) {
    return { found: false, urls: [], error: "API key not configured" };
  }

  try {
    const response = await fetchWithTimeout("https://urlhaus-api.abuse.ch/v1/host/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Auth-Key": authKey
      },
      body: `host=${encodeURIComponent(domain)}`
    });
    if (!response.ok) throw new Error(`URLhaus query failed (${response.status})`);

    const data = await response.json();
    if (data.query_status === "no_results" || data.query_status === "not_found") {
      return { found: false, urls: [] };
    }
    if (data.query_status !== "ok") {
      return { found: false, urls: [], error: `URLhaus status: ${data.query_status}` };
    }

    const urls = (data.urls || []).map((u: any) => u.url).slice(0, 5);
    return { found: urls.length > 0, urls };
  } catch (error) {
    return { found: false, urls: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkPhishTank(url: string): Promise<{ listed: boolean; error?: string }> {
  try {
    const response = await fetchWithTimeout("https://checkurl.phishtank.com/checkurl/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // PhishTank requires a descriptive User-Agent or it rate-limits/blocks requests
        "User-Agent": "phishtank/cetsat-recon"
      },
      body: `url=${encodeURIComponent(url)}&format=json`
    });
    if (!response.ok) throw new Error(`PhishTank query failed (${response.status})`);

    const data = await response.json();
    const listed = data.results?.in_database === true && data.results?.valid === true;
    return { listed };
  } catch (error) {
    return { listed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Common identity/SSO/CDN infrastructure that legitimately references arbitrary third-party
// domains (e.g. an OAuth redirect_uri, an embedded widget) - excluded to cut obvious noise.
// Best-effort filter, not exhaustive; genuine impersonation attempts should still surface.
const URLSCAN_DENYLIST = [
  "login.microsoftonline.com", "login.live.com", "login.windows.net",
  "accounts.google.com", "www.google.com", "appleid.apple.com",
  "www.facebook.com", "connect.facebook.net", "github.com",
  "www.linkedin.com", "auth0.com"
];

// Best-effort brand-impersonation search: looks for scans of OTHER pages (not this domain,
// its subdomains, or known SSO/CDN infrastructure) that reference this domain - e.g. a
// phishing kit pulling in a real logo/resource, or a cloned login page linking back to
// the genuine site. Findings here are worth a manual look, not an automatic verdict.
async function checkUrlscanImpersonation(domain: string): Promise<{ impersonationCount: number; samples: string[]; error?: string }> {
  try {
    const response = await fetchWithTimeout(
      `https://urlscan.io/api/v1/search/?q=domain%3A${encodeURIComponent(domain)}`
    );
    if (!response.ok) throw new Error(`urlscan.io query failed (${response.status})`);

    const data = await response.json();
    const results: any[] = data.results || [];

    const impersonating = results.filter(r => {
      const pageDomain: string | undefined = r.page?.domain;
      if (!pageDomain || pageDomain === domain || pageDomain.endsWith(`.${domain}`)) return false;
      return !URLSCAN_DENYLIST.some(d => pageDomain === d || pageDomain.endsWith(`.${d}`));
    });

    const samples = impersonating.slice(0, 5).map(r => r.page.url);
    return { impersonationCount: impersonating.length, samples };
  } catch (error) {
    return { impersonationCount: 0, samples: [], error: error instanceof Error ? error.message : String(error) };
  }
}

// Runs PhishTank against a small, capped set of already-registered lookalike domains
// (found via the same permutation logic as the Lookalike Domains check) to see whether
// any of them are actively serving phishing content, not just squatted.
async function checkLookalikePhishing(domain: string): Promise<{
  checked: number;
  phishingListed: string[];
  certIssued: string[];
  error?: string;
}> {
  try {
    const { found } = await findRegisteredLookalikes(domain);
    const candidates = found.slice(0, 10);

    const phishResults = await Promise.all(
      candidates.map(async (c: LookalikeCandidate) => ({
        domain: c.domain,
        hasCert: c.hasCert,
        ...(await checkPhishTank(`https://${c.domain}/`))
      }))
    );

    return {
      checked: candidates.length,
      phishingListed: phishResults.filter(r => r.listed).map(r => r.domain),
      certIssued: phishResults.filter(r => r.hasCert).map(r => r.domain)
    };
  } catch (error) {
    return { checked: 0, phishingListed: [], certIssued: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkThreatIntel(domain: string): Promise<CheckResult> {
  try {
    const [otx, urlhaus, phishTank, urlscan, lookalikePhishing] = await Promise.all([
      checkOTX(domain),
      checkURLhaus(domain),
      checkPhishTank(`https://${domain}/`),
      checkUrlscanImpersonation(domain),
      checkLookalikePhishing(domain)
    ]);

    const sourceChecks: { name: string; error?: string }[] = [
      { name: "AlienVault OTX", error: otx.error },
      { name: "URLhaus", error: urlhaus.error },
      { name: "PhishTank", error: phishTank.error },
      { name: "urlscan.io", error: urlscan.error }
    ];
    const checkedSources = sourceChecks.filter(s => !s.error).map(s => s.name);
    const uncheckedSources = sourceChecks.filter(s => s.error).map(s => s.name);

    const findings: string[] = [];
    if (otx.pulseCount > 0) findings.push(`${otx.pulseCount} threat-intel pulse(s) mention this domain`);
    if (urlhaus.found) findings.push(`${urlhaus.urls.length} malware URL(s) hosted on this domain (URLhaus)`);
    if (phishTank.listed) findings.push("domain listed as an active phishing site (PhishTank)");
    if (urlscan.impersonationCount > 0) findings.push(`${urlscan.impersonationCount} other page(s) referencing this domain found via urlscan.io (worth a manual look, may include false positives)`);
    if (lookalikePhishing.phishingListed.length > 0) {
      findings.push(`${lookalikePhishing.phishingListed.length} lookalike domain(s) actively listed as phishing sites: ${lookalikePhishing.phishingListed.join(", ")}`);
    }
    if (lookalikePhishing.certIssued.length > 0) {
      findings.push(`TLS certificate(s) issued to ${lookalikePhishing.certIssued.length} lookalike domain(s), indicating active hosting: ${lookalikePhishing.certIssued.join(", ")}`);
    }

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (phishTank.listed || urlhaus.found || lookalikePhishing.phishingListed.length > 0) {
      status = "action";
      capability = "human_firewall";
    } else if (otx.pulseCount > 0 || urlscan.impersonationCount > 0 || lookalikePhishing.certIssued.length > 0) {
      status = "review";
      capability = otx.pulseCount > 0 ? "managed_security" : "human_firewall";
    } else if (checkedSources.length === 0) {
      status = "good";
    }

    const summary = buildSummary(findings, checkedSources, uncheckedSources);

    return {
      id: "threat_intel",
      label: "Threat intelligence",
      status,
      data: {
        otx,
        urlhaus,
        phishTank,
        urlscan,
        lookalikePhishing,
        checkedSources,
        uncheckedSources
      },
      summary,
      capability
    };
  } catch (error) {
    return {
      id: "threat_intel",
      label: "Threat intelligence",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check threat intelligence sources."
    };
  }
}

function buildSummary(findings: string[], checkedSources: string[], uncheckedSources: string[]): string {
  if (findings.length > 0) {
    return `${findings.length} finding(s): ${findings.join("; ")}.`;
  }

  const base = checkedSources.length > 0
    ? `No indicators found across ${checkedSources.join(", ")}.`
    : "No threat-intel sources could be reached.";

  return uncheckedSources.length > 0
    ? `${base} (Skipped: ${uncheckedSources.join(", ")}.)`
    : base;
}
