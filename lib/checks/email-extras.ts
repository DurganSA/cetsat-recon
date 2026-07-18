import { CheckResult } from "../types";

export async function checkEmailExtras(domain: string): Promise<CheckResult> {
  try {
    const [mtaSts, tlsRpt, bimi, spfLookups] = await Promise.all([
      checkMTASTS(domain),
      checkTLSRPT(domain),
      checkBIMI(domain),
      checkSPFLookupCount(domain)
    ]);

    const issues: string[] = [];
    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (!mtaSts) issues.push("MTA-STS not configured");
    if (!tlsRpt) issues.push("TLS-RPT not configured");
    if (!bimi) issues.push("BIMI not configured");
    if (spfLookups > 10) {
      issues.push(`SPF has ${spfLookups} DNS lookups (max 10)`);
      status = "action";
      capability = "email_security";
    }

    if (issues.length >= 3) {
      status = status === "action" ? "action" : "review";
      capability = capability || "email_security";
    }

    return {
      id: "email_extras",
      label: "Email hygiene extras",
      status,
      data: {
        mtaSts,
        tlsRpt,
        bimi,
        spfLookups
      },
      summary: issues.length > 0
        ? `Email hygiene opportunities: ${issues.join(", ")}.`
        : "Advanced email security measures in place.",
      capability
    };
  } catch (error) {
    return {
      id: "email_extras",
      label: "Email hygiene extras",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check email extras."
    };
  }
}

async function resolveTXT(domain: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await response.json();
    return data.Answer?.map((a: any) => a.data.replace(/^"|"$/g, "")) || [];
  } catch {
    return [];
  }
}

async function checkMTASTS(domain: string): Promise<boolean> {
  try {
    const records = await resolveTXT(`_mta-sts.${domain}`);
    return records.some((r: string) => r.startsWith("v=STSv1"));
  } catch {
    return false;
  }
}

async function checkTLSRPT(domain: string): Promise<boolean> {
  try {
    const records = await resolveTXT(`_smtp._tls.${domain}`);
    return records.some((r: string) => r.startsWith("v=TLSRPTv1"));
  } catch {
    return false;
  }
}

async function checkBIMI(domain: string): Promise<boolean> {
  try {
    const records = await resolveTXT(`default._bimi.${domain}`);
    return records.some((r: string) => r.startsWith("v=BIMI1"));
  } catch {
    return false;
  }
}

async function checkSPFLookupCount(domain: string): Promise<number> {
  try {
    const records = await resolveTXT(domain);
    const spf = records.find((r: string) => r.startsWith("v=spf1"));
    if (!spf) return 0;

    let lookupCount = 0;
    const mechanisms = spf.split(/\s+/);

    for (const mech of mechanisms) {
      if (mech.startsWith("include:") || mech.startsWith("a:") || mech.startsWith("mx:") || mech.startsWith("exists:")) {
        lookupCount++;
      } else if (mech === "a" || mech === "mx") {
        lookupCount++;
      } else if (mech.startsWith("redirect=")) {
        lookupCount++;
      }
    }

    return lookupCount;
  } catch {
    return 0;
  }
}
