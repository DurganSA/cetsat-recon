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

    // Detect shared provider from MX records
    const mxHosts = mxRecords.map(mx => mx.exchange.toLowerCase().replace(/\.$/, ""));
    const isSharedProvider = mxHosts.some(host =>
      host.includes("mimecast") ||
      host.includes("protection.outlook") ||
      host.includes("google.com") ||
      host.includes("googlemail") ||
      host.includes("pphosted") ||
      host.includes("proofpoint") ||
      host.includes("barracuda") ||
      host.includes("mailprotector") ||
      host.includes("messagelabs")
    );

    const mxIpsRaw: string[] = [];
    for (const mx of mxRecords.slice(0, 3)) {
      try {
        const ips = await resolveA(mx.exchange);
        mxIpsRaw.push(...ips);
      } catch {
        continue;
      }
    }

    // Dedupe IPs
    const mxIps = Array.from(new Set(mxIpsRaw));

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

    // Count distinct blocklists
    const distinctBlocklists = Array.from(new Set(listings.map(l => l.list)));
    const listedIps = Array.from(new Set(listings.map(l => l.ip)));

    let status: "good" | "review" | "action" | "info" = "good";
    let capability: string | undefined;

    // If shared provider, downgrade to info with caveat
    if (listings.length > 0 && isSharedProvider) {
      status = "info";
    } else if (listings.length > 0) {
      status = "review";
      capability = "managed_email";
    }

    let summary: string;
    if (listings.length > 0) {
      summary = `${listedIps.length} mail IP(s) listed on ${distinctBlocklists.length} blocklist(s): ${distinctBlocklists.join(", ")}.`;
      if (isSharedProvider) {
        summary += " (Note: IPs belong to shared email provider infrastructure)";
      }
    } else {
      summary = `${mxIps.length} mail IP(s) checked, clean across ${blocklists.length} major blocklists.`;
    }

    return {
      id: "blocklist",
      label: "Mail reputation (DNSBL)",
      status,
      data: {
        mxIps,
        listings,
        distinctBlocklists,
        listedIps,
        sharedProvider: isSharedProvider
      },
      summary,
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
