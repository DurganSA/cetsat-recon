// Shared bot-protection-aware HTML fetch helper, used by any check that reads a page's
// raw HTML (geo, site-content). Extracted from geo.ts so both checks stay in sync
// instead of drifting copies of the same challenge-detection logic.

const USER_AGENTS = {
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"
};

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

export function isCloudflareChallengePage(html: string, headers: Headers): boolean {
  const csp = headers.get('content-security-policy') || '';
  const htmlLower = html.toLowerCase();

  return (
    csp.includes('challenges.cloudflare.com') ||
    htmlLower.includes('just a moment') ||
    htmlLower.includes('checking your browser') ||
    htmlLower.includes('cloudflare ray id')
  );
}

// Try fetching with multiple user-agents until one gets past bot protection.
export async function fetchWithFallback(url: string, options: RequestInit = {}): Promise<Response> {
  const strategies = ['chrome', 'googlebot', 'bingbot'] as const;

  for (const strategy of strategies) {
    try {
      const headers = getBrowserHeaders(USER_AGENTS[strategy]);
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
      });

      const html = await response.text();
      if (!isCloudflareChallengePage(html, response.headers)) {
        return new Response(html, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
    } catch {
      // Network error, try next strategy
    }
  }

  const headers = getBrowserHeaders(USER_AGENTS.chrome);
  return fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
}
