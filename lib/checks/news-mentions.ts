import { CheckResult } from "../types";

// GDELT DOC 2.0 - free, keyless global news search. This is a sales-context signal
// ("has this company had a publicised incident?"), not a security finding, so it always
// lands on "info"/"review" and never "action". GDELT enforces a strict per-IP rate limit
// (documented as one request per ~5 seconds, but observed to be considerably stricter in
// practice on shared egress IPs); on a shared serverless IP pool this could occasionally
// be hit even from a single request. Any non-JSON/rate-limited response degrades to
// "not checked", never a false "clean" result.
//
// Observed in production: when GDELT rejects a request (429 or its plain-text notice),
// it can take 10+ seconds to respond rather than failing fast, which tripped a 10s
// timeout and surfaced as a generic "aborted due to timeout" error. 20s gives real
// headroom for that slow-rejection behaviour while this check still degrades gracefully
// (to "info") if it's ever exceeded.
const FETCH_TIMEOUT_MS = 20000;

const BREACH_KEYWORDS =
  '(breach OR ransomware OR "data breach" OR cyberattack OR "cyber attack" OR hacked OR hack OR "security incident")';

interface GDELTArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
}

async function queryGDELT(query: string): Promise<GDELTArticle[] | null> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=5&timespan=2years&sort=datedesc`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) return null;

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.articles || [];
  } catch {
    // GDELT returns a plain-text rate-limit notice (not JSON) with a 200 status when
    // throttled - this is the only way to distinguish "rate limited" from "zero results"
    // (a genuine zero-results response is a valid `{}` or `{"articles":[]}` JSON body).
    return null;
  }
}

export async function checkNewsMentions(domain: string, companyName?: string): Promise<CheckResult> {
  // Searching by domain alone would find articles published ON that domain, not articles
  // ABOUT the company from the wider press - a company name is required for this to be
  // meaningful. No name, no guess: a domain-derived guess (e.g. stripping the TLD) risks
  // confidently mis-attributing unrelated coverage to the wrong company.
  if (!companyName) {
    return {
      id: "news_mentions",
      label: "News & breach mentions",
      status: "info",
      data: { available: false, reason: "No company name provided" },
      summary: "News mention search unavailable - no company name provided."
    };
  }

  try {
    const query = `"${companyName}" ${BREACH_KEYWORDS}`;
    const articles = await queryGDELT(query);

    if (articles === null) {
      return {
        id: "news_mentions",
        label: "News & breach mentions",
        status: "info",
        data: { available: false, reason: "Rate limited or unavailable" },
        summary: "News mention search rate limited - not checked this scan."
      };
    }

    if (articles.length === 0) {
      return {
        id: "news_mentions",
        label: "News & breach mentions",
        status: "info",
        data: { available: true, found: false, articles: [] },
        summary: "No recent breach-related news mentions found."
      };
    }

    return {
      id: "news_mentions",
      label: "News & breach mentions",
      status: "review",
      data: {
        available: true,
        found: true,
        articles: articles.map((a) => ({
          title: a.title,
          url: a.url,
          date: a.seendate,
          source: a.domain
        }))
      },
      summary: `${articles.length} recent news article(s) mentioning "${companyName}" alongside breach-related terms - worth a read before referencing.`
    };
  } catch (error) {
    return {
      id: "news_mentions",
      label: "News & breach mentions",
      status: "info",
      data: { available: false, reason: error instanceof Error ? error.message : String(error) },
      summary: "Could not complete news mention search."
    };
  }
}
