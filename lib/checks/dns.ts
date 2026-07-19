import { CheckResult } from "../types";

export async function checkDNS(domain: string): Promise<CheckResult> {
  try {
    const [aRecords, nsRecords, dnssecStatus] = await Promise.all([
      resolveA(domain).catch(() => []),
      resolveNS(domain).catch(() => []),
      checkDNSSEC(domain)
    ]);

    const hasRecords = aRecords.length > 0;
    const hasNameservers = nsRecords.length > 0;

    // DNSSEC on/off is a real, comparable security signal (comparison.ts already has a
    // metric extractor for it) - hardcoding "info" always made it invisible to both the
    // per-check traffic light and competitor scoring regardless of the actual result.
    const status: "good" | "review" = dnssecStatus ? "good" : "review";

    return {
      id: "dns",
      label: "DNS & DNSSEC",
      status,
      data: {
        aRecords,
        nsRecords,
        dnssec: dnssecStatus
      },
      summary: `DNS resolves via ${nsRecords.length} nameserver(s). DNSSEC: ${dnssecStatus ? "enabled" : "not detected"}.`,
      capability: dnssecStatus ? undefined : "managed_security"
    };
  } catch (error) {
    return {
      id: "dns",
      label: "DNS & DNSSEC",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not resolve DNS records."
    };
  }
}

async function resolveA(domain: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await response.json();
    return data.Answer?.map((a: any) => a.data) || [];
  } catch {
    return [];
  }
}

async function resolveNS(domain: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await response.json();
    return data.Answer?.map((a: any) => a.data) || [];
  } catch {
    return [];
  }
}

async function checkDNSSEC(domain: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=DNSKEY`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await response.json();
    // data.Answer is undefined when there's no DNSKEY record (the normal no-DNSSEC
    // case) - "undefined && x" short-circuits to undefined, not false, which would
    // silently drop the dnssec field from the JSON output entirely. Coerce to a real
    // boolean so the field is always present.
    return Boolean(data.Answer && data.Answer.length > 0);
  } catch {
    return false;
  }
}
