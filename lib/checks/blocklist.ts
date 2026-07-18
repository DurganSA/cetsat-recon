import { CheckResult } from "../types";

async function resolveMX(domain: string): Promise<Array<{ exchange: string; priority: number }>> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await response.json();
    return data.Answer?.map((a: any) => {
      const parts = a.data.split(" ");
      return { priority: parseInt(parts[0]), exchange: parts[1] };
    }) || [];
  } catch {
    return [];
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

export async function checkBlocklist(domain: string): Promise<CheckResult> {
  try {
    const mxRecords = await resolveMX(domain).catch(() => []);

    if (mxRecords.length === 0) {
      return {
        id: "blocklist",
        label: "Mail reputation (DNSBL)",
        status: "info",
        data: {},
        summary: "No MX records found, skipping blocklist check."
      };
    }

    const mxIps: string[] = [];
    for (const mx of mxRecords.slice(0, 3)) {
      try {
        const ips = await resolveA(mx.exchange);
        mxIps.push(...ips);
      } catch {
        continue;
      }
    }

    if (mxIps.length === 0) {
      return {
        id: "blocklist",
        label: "Mail reputation (DNSBL)",
        status: "info",
        data: {},
        summary: "Could not resolve MX IPs."
      };
    }

    const blocklists = [
      "zen.spamhaus.org",
      "bl.spamcop.net",
      "dnsbl.sorbs.net"
    ];

    const listings: Array<{ ip: string; list: string }> = [];

    for (const ip of mxIps) {
      const reversed = ip.split(".").reverse().join(".");
      for (const list of blocklists) {
        try {
          const result = await resolveA(`${reversed}.${list}`);
          if (result.length > 0) {
            listings.push({ ip, list });
          }
        } catch {
          // Not listed
        }
      }
    }

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (listings.length > 0) {
      status = "review";
      capability = "managed_email";
    }

    return {
      id: "blocklist",
      label: "Mail reputation (DNSBL)",
      status,
      data: {
        mxIps,
        listings
      },
      summary: listings.length > 0
        ? `Mail server IP(s) listed on ${listings.length} blocklist(s): ${listings.map(l => l.list).join(", ")}.`
        : `Mail server IP(s) clean across ${blocklists.length} major blocklists.`,
      capability
    };
  } catch (error) {
    return {
      id: "blocklist",
      label: "Mail reputation (DNSBL)",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check blocklist status."
    };
  }
}
