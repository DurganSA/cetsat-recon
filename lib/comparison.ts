import { CheckResult, CheckStatus, ComparisonEntry, ComparisonResult, DomainScan, DomainRole } from "./types";

// Higher score = better. "info" is excluded from scoring (not a security/quality signal either way).
const STATUS_SCORE: Record<CheckStatus, number> = {
  good: 2,
  review: 1,
  action: 0,
  info: -1
};

type MetricExtractor = (result: CheckResult) => string | undefined;

// Pulls a short, human-readable headline metric out of a check's data for the comparison table.
// Falls back to just showing status if no extractor is defined for a check id.
const METRIC_EXTRACTORS: Record<string, MetricExtractor> = {
  pagespeed: (r) => {
    const mobile = r.data?.mobile?.performanceScore;
    const seo = r.data?.mobile?.seoScore;
    if (mobile == null) return undefined;
    return `Mobile perf ${mobile}/100, SEO ${seo ?? "?"}/100`;
  },
  headers: (r) => (r.data?.grade ? `Grade ${r.data.grade}` : undefined),
  geo: (r) => {
    if (r.data?.error) return "Bot protection (partial data)";
    const issues = r.data?.issues?.length ?? 0;
    const opportunities = r.data?.opportunities?.length ?? 0;
    return `${issues} issue(s), ${opportunities} opportunity(ies)`;
  },
  email: (r) => (r.data?.dmarcDetails?.policy ? `DMARC: ${r.data.dmarcDetails.policy}` : undefined),
  dns: (r) => (r.data?.dnssec != null ? `DNSSEC ${r.data.dnssec ? "on" : "off"}` : undefined),
  subdomains: (r) => (r.data?.count != null ? `${r.data.count} subdomain(s)` : undefined),
  web_hygiene: (r) => (r.data?.httpsEnforcement != null ? `HTTPS enforced: ${r.data.httpsEnforcement ? "yes" : "no"}` : undefined),
  email_extras: (r) => {
    if (!r.data) return undefined;
    const enabled = [r.data.mtaSts && "MTA-STS", r.data.tlsRpt && "TLS-RPT", r.data.bimi && "BIMI"].filter(Boolean);
    return enabled.length > 0 ? `${enabled.length}/3 configured` : "0/3 configured";
  },
  blocklist: (r) => (r.data?.listedIps ? `${r.data.listedIps.length} listed IP(s)` : undefined),
  fingerprint: (r) => (r.data?.isOutdated != null ? (r.data.isOutdated ? "Outdated software" : "Up to date") : undefined)
};

// Only compares checks that ran (and returned data) for every domain in the scan set.
export function buildComparison(scans: DomainScan[]): ComparisonResult {
  if (scans.length < 2) {
    return { domains: scans.map(s => ({ role: s.role, domain: s.domain })), scores: {}, entries: [], headlines: [] };
  }

  const checkIdSets = scans.map(s => new Set(s.results.map(r => r.id)));
  const commonIds = [...checkIdSets[0]].filter(id => checkIdSets.every(set => set.has(id)));

  const scores: Record<string, number> = {};
  scans.forEach(s => { scores[s.role] = 0; });

  const entries: ComparisonEntry[] = commonIds.map(checkId => {
    const label = scans[0].results.find(r => r.id === checkId)?.label ?? checkId;
    const metricFn = METRIC_EXTRACTORS[checkId];

    const domains = scans.map(s => {
      const result = s.results.find(r => r.id === checkId)!;
      return {
        role: s.role,
        domain: s.domain,
        status: result.status,
        metric: metricFn ? metricFn(result) : undefined
      };
    });

    const scored = domains.filter(d => d.status !== "info");
    let winner: DomainRole | "tie" | null = null;

    if (scored.length > 0) {
      const maxScore = Math.max(...scored.map(d => STATUS_SCORE[d.status]));
      const winners = scored.filter(d => STATUS_SCORE[d.status] === maxScore);
      winner = winners.length === 1 ? winners[0].role : "tie";

      domains.forEach(d => {
        if (d.status !== "info") scores[d.role] += STATUS_SCORE[d.status];
      });
    }

    return { checkId, label, domains, winner };
  });

  const headlines = buildHeadlines(entries, scans);

  return {
    domains: scans.map(s => ({ role: s.role, domain: s.domain })),
    scores,
    entries,
    headlines
  };
}

function buildHeadlines(entries: ComparisonEntry[], scans: DomainScan[]): string[] {
  const primary = scans.find(s => s.role === "primary");
  if (!primary) return [];

  const headlines: string[] = [];

  for (const entry of entries) {
    const primaryData = entry.domains.find(d => d.role === "primary");
    if (!primaryData || primaryData.status === "info") continue;

    for (const other of entry.domains) {
      if (other.role === "primary" || other.status === "info") continue;

      const primaryScore = STATUS_SCORE[primaryData.status];
      const otherScore = STATUS_SCORE[other.status];

      if (otherScore > primaryScore) {
        headlines.push(
          `${other.domain} is ahead on ${entry.label}${other.metric ? ` (${other.metric})` : ""}, while ${primary.domain} is ${primaryData.status}${primaryData.metric ? ` (${primaryData.metric})` : ""}.`
        );
      } else if (primaryScore > otherScore) {
        headlines.push(
          `${primary.domain} is ahead of ${other.domain} on ${entry.label}${primaryData.metric ? ` (${primaryData.metric})` : ""}.`
        );
      }
    }
  }

  // Cap to keep the report/JSON focused on the most actionable gaps
  return headlines.slice(0, 10);
}
