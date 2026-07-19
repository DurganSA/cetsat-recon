// Shared domain normalisation, used both server-side (route.ts, for the actual scan
// input) and client-side (page.tsx, so the exported JSON/report/filename echo the same
// canonical domain the scan actually ran against instead of the raw "www.example.com"
// the user typed in).
export function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim();

  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/^www\./, "");
  normalized = normalized.split("/")[0];

  return normalized;
}

export function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-z0-9.-]+\.[a-z]{2,}$/;
  return domainRegex.test(domain);
}
