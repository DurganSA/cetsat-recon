import { CheckResult } from "../types";

// Multiple user-agent strategies
const USER_AGENTS = {
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"
};

// Realistic browser headers
function getBrowserHeaders(userAgent: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
}

// Detect a Cloudflare (or similar) challenge page from both the CSP header and the
// response body - checking headers alone missed cases where a WAF/CDN simply errors
// on HEAD requests for reasons unrelated to bot protection (e.g. a backend routing quirk).
function isChallengePage(headers: Headers, html: string): boolean {
  const csp = headers.get('content-security-policy') || '';
  const htmlLower = html.toLowerCase();
  return (
    csp.includes('challenges.cloudflare.com') ||
    htmlLower.includes('just a moment') ||
    htmlLower.includes('checking your browser') ||
    htmlLower.includes('cloudflare ray id')
  );
}

type FetchOutcome =
  | { kind: "ok"; response: Response }
  | { kind: "challenge" }
  | { kind: "failed"; error: string };

// Try multiple strategies. Uses GET (not HEAD) because some servers/WAFs reject or
// mishandle HEAD requests for reasons that have nothing to do with bot protection.
async function fetchHeadersWithFallback(url: string): Promise<FetchOutcome> {
  const strategies = ['chrome', 'googlebot', 'bingbot'] as const;
  let lastError = "Unknown error";
  let challengeSeen = false;

  for (const strategy of strategies) {
    try {
      const headers = getBrowserHeaders(USER_AGENTS[strategy]);
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers
      });
      const html = await response.text();

      if (!isChallengePage(response.headers, html)) {
        return { kind: "ok", response };
      }
      challengeSeen = true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  // Only report bot protection if we actually matched a challenge marker on at least
  // one attempt - if every strategy instead threw, it's a genuine fetch failure
  // (e.g. the server rejects the request method) and shouldn't be mislabeled.
  return challengeSeen ? { kind: "challenge" } : { kind: "failed", error: lastError };
}

export async function checkHeaders(domain: string): Promise<CheckResult> {
  try {
    const url = `https://${domain}`;
    const outcome = await fetchHeadersWithFallback(url);

    if (outcome.kind === "challenge") {
      return {
        id: "headers",
        label: "Website security headers",
        status: "info",
        data: {
          error: "Bot protection detected",
          message: "Site has strict bot protection that blocks all scanner attempts (including search engine user-agents). Security headers could not be analyzed."
        },
        summary: "Bot protection detected - could not analyze headers."
      };
    }

    if (outcome.kind === "failed") {
      return {
        id: "headers",
        label: "Website security headers",
        status: "info",
        data: { error: outcome.error },
        summary: `Could not fetch security headers: ${outcome.error}`
      };
    }

    const response = outcome.response;
    const headers = Object.fromEntries(response.headers.entries());

    const securityHeaders = {
      "strict-transport-security": headers["strict-transport-security"] || null,
      "content-security-policy": headers["content-security-policy"] || null,
      "x-frame-options": headers["x-frame-options"] || null,
      "x-content-type-options": headers["x-content-type-options"] || null,
      "referrer-policy": headers["referrer-policy"] || null,
      "permissions-policy": headers["permissions-policy"] || null
    };

    const score = calculateSecurityScore(securityHeaders);
    const grade = scoreToGrade(score);

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (grade === "F" || grade === "E") {
      status = "action";
      capability = "managed_security";
    } else if (grade === "D" || grade === "C") {
      status = "review";
      capability = "managed_security";
    }

    return {
      id: "headers",
      label: "Website security headers",
      status,
      data: {
        headers: securityHeaders,
        score,
        grade
      },
      summary: `Security headers grade: ${grade}. ${getMissingHeadersSummary(securityHeaders)}.`,
      capability
    };
  } catch (error) {
    return {
      id: "headers",
      label: "Website security headers",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check security headers."
    };
  }
}

function calculateSecurityScore(headers: Record<string, string | null>): number {
  let score = 0;
  const weights = {
    "strict-transport-security": 20,
    "content-security-policy": 25,
    "x-frame-options": 15,
    "x-content-type-options": 15,
    "referrer-policy": 15,
    "permissions-policy": 10
  };

  for (const [header, weight] of Object.entries(weights)) {
    if (headers[header]) {
      score += weight;
    }
  }

  return score;
}

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  if (score >= 20) return "E";
  return "F";
}

function getMissingHeadersSummary(headers: Record<string, string | null>): string {
  const missing = Object.entries(headers)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length === 0) return "All key headers present";
  if (missing.length <= 2) return `Missing: ${missing.join(", ")}`;
  return `${missing.length} key headers missing`;
}
