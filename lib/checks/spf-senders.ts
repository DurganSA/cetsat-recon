import { CheckResult } from "../types";

// Hostname substrings that identify well-known email/marketing platforms, so an
// SPF entry can be labelled instead of left as a bare IP or hostname. Matching is a
// simple case-insensitive substring check against the resolved PTR or literal a: host.
const KNOWN_PROVIDERS: Array<{ match: string; label: string }> = [
  { match: "mcsv.net", label: "Mailchimp" },
  { match: "mcdlv.net", label: "Mailchimp" },
  { match: "rsgsv.net", label: "Mailchimp" },
  { match: "mailchimp.com", label: "Mailchimp" },
  { match: "sendgrid.net", label: "SendGrid" },
  { match: "sparkpostmail.com", label: "SparkPost" },
  { match: "mailgun.org", label: "Mailgun" },
  { match: "postmarkapp.com", label: "Postmark" },
  { match: "amazonses.com", label: "Amazon SES" },
  { match: "googlemail.com", label: "Google" },
  { match: "google.com", label: "Google" },
  { match: "protection.outlook.com", label: "Microsoft 365" },
  { match: "outlook.com", label: "Microsoft 365" },
  { match: "mimecast.com", label: "Mimecast" },
  { match: "zoho.com", label: "Zoho Mail" },
  { match: "hubspot", label: "HubSpot" },
  { match: "exacttarget.com", label: "Salesforce Marketing Cloud" },
  { match: "marketingcloudapps.com", label: "Salesforce Marketing Cloud" },
  { match: "constantcontact.com", label: "Constant Contact" },
  { match: "klaviyomail.com", label: "Klaviyo" },
  { match: "activehosted.com", label: "ActiveCampaign" },
  { match: "activecampaign.com", label: "ActiveCampaign" }
];

type SPFMechanism = {
  type: "include" | "ip" | "a";
  value: string;
  ptr?: string | null;
  resolvedIp?: string | null;
  provider?: string;
  matchesOwnHost?: boolean;
};

function classify(hostname: string | null | undefined): string | undefined {
  if (!hostname) return undefined;
  const lower = hostname.toLowerCase();
  return KNOWN_PROVIDERS.find(p => lower.includes(p.match))?.label;
}

async function resolveA(name: string): Promise<string[]> {
  try {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=A`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    return data.Answer?.map((a: any) => a.data) || [];
  } catch {
    return [];
  }
}

async function resolveTXT(domain: string): Promise<string[]> {
  try {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    return data.Answer?.map((a: any) => a.data.replace(/^"|"$/g, "")) || [];
  } catch {
    return [];
  }
}

function expandIPv6(ip: string): string | null {
  const [head, tail] = ip.includes("::") ? ip.split("::") : [ip, ""];
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) return null;
  const zeros = new Array(missing).fill("0");
  const allParts = [...headParts, ...zeros, ...tailParts].map(p => p.padStart(4, "0"));
  return allParts.join(":");
}

function buildReverseName(ip: string): string | null {
  if (ip.includes(":")) {
    const expanded = expandIPv6(ip);
    if (!expanded) return null;
    const nibbles = expanded.replace(/:/g, "").split("").reverse().join(".");
    return `${nibbles}.ip6.arpa`;
  }
  const octets = ip.split(".");
  if (octets.length !== 4) return null;
  return `${octets.reverse().join(".")}.in-addr.arpa`;
}

async function reverseLookup(ip: string): Promise<string | null> {
  const reverseName = buildReverseName(ip);
  if (!reverseName) return null;
  try {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${reverseName}&type=PTR`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    const ptr = data.Answer?.[0]?.data;
    return ptr ? ptr.replace(/\.$/, "") : null;
  } catch {
    return null;
  }
}

export async function checkSpfSenders(domain: string): Promise<CheckResult> {
  try {
    const records = await resolveTXT(domain);
    const spfRecord = records.find(r => r.startsWith("v=spf1")) || null;

    if (!spfRecord) {
      return {
        id: "spf_senders",
        label: "Authorized mail senders (SPF)",
        status: "info",
        data: { mechanisms: [] },
        summary: "No SPF record found - nothing to inspect."
      };
    }

    // Resolve the domain's own web-hosting server so ip4/ip6 entries that point at the
    // same box (even via a different IP on that host) can be recognised as "your own
    // server", not flagged as an unrecognised third party.
    const ownIps = await resolveA(domain);
    const ownPtrs = (await Promise.all(ownIps.map(reverseLookup))).filter((p): p is string => !!p);

    const tokens = spfRecord
      .split(/\s+/)
      .filter(t => t !== "v=spf1" && !/^[~+?-]?all$/.test(t));

    const mechanisms: SPFMechanism[] = [];

    for (const token of tokens) {
      if (token.startsWith("include:")) {
        const value = token.slice("include:".length);
        mechanisms.push({ type: "include", value, provider: classify(value) });
      } else if (token.startsWith("ip4:") || token.startsWith("ip6:")) {
        const raw = token.slice(token.indexOf(":") + 1);
        const [ip] = raw.split("/");
        const ptr = await reverseLookup(ip);
        mechanisms.push({
          type: "ip",
          value: raw,
          ptr,
          provider: classify(ptr),
          matchesOwnHost: ownIps.includes(ip) || (!!ptr && ownPtrs.includes(ptr))
        });
      } else if (token === "a" || token.startsWith("a:")) {
        const hostname = token === "a" ? domain : token.slice("a:".length);
        const resolvedIps = await resolveA(hostname);
        mechanisms.push({
          type: "a",
          value: hostname,
          resolvedIp: resolvedIps[0] || null,
          provider: classify(hostname),
          matchesOwnHost: hostname === domain
        });
      }
      // mx/exists/ptr/redirect mechanisms are intentionally skipped - mx is already
      // covered by the main email check, and exists/ptr rarely map to a single sender.
    }

    const unrecognized = mechanisms.filter(
      m => (m.type === "ip" || m.type === "a") && !m.provider && !m.matchesOwnHost
    );

    // "good" (not "info") for the clean case - comparison scoring excludes "info"
    // entirely as neutral, so a genuinely clean result needs "good" to be able to win
    // a competitor comparison against a domain that has an unrecognized sender.
    const status: "good" | "review" = unrecognized.length > 0 ? "review" : "good";

    const recognizedProviders = Array.from(
      new Set(mechanisms.map(m => m.provider).filter((p): p is string => !!p))
    );

    const summaryParts: string[] = [];
    if (recognizedProviders.length > 0) {
      summaryParts.push(`Recognized senders: ${recognizedProviders.join(", ")}`);
    }
    if (unrecognized.length > 0) {
      summaryParts.push(
        `${unrecognized.length} unrecognized sender(s) authorized to send mail as this domain (verify these are still needed - could be stale entries)`
      );
    }
    if (summaryParts.length === 0) {
      summaryParts.push("All authorized senders are recognized providers or your own server.");
    }

    return {
      id: "spf_senders",
      label: "Authorized mail senders (SPF)",
      status,
      data: { mechanisms },
      summary: summaryParts.join(". ") + ".",
      capability: unrecognized.length > 0 ? "email_security" : undefined
    };
  } catch (error) {
    return {
      id: "spf_senders",
      label: "Authorized mail senders (SPF)",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not analyze SPF authorized senders."
    };
  }
}
