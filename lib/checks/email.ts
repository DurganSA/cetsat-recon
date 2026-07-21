import { CheckResult } from "../types";

export async function checkEmail(domain: string): Promise<CheckResult> {
  try {
    const [mxRecords, spfRecord, dmarcRecord, dkimIndicator] = await Promise.all([
      resolveMX(domain).catch(() => []),
      getSPFRecord(domain),
      getDMARCRecord(domain),
      checkDKIMSetup(domain)
    ]);

    const hasMX = mxRecords.length > 0;
    const hasSPF = !!spfRecord;
    const hasDMARC = !!dmarcRecord;
    const dmarcPolicy = dmarcRecord ? extractDMARCPolicy(dmarcRecord) : null;
    
    // Parse DMARC nuances
    let dmarcDetails = null;
    if (dmarcRecord) {
      const ruaMatch = dmarcRecord.match(/rua=([^;]+)/);
      const rufMatch = dmarcRecord.match(/ruf=([^;]+)/);
      dmarcDetails = {
        policy: dmarcPolicy,
        hasRua: !!ruaMatch,
        hasRuf: !!rufMatch,
        ruaTarget: ruaMatch ? ruaMatch[1].trim() : null,
        rufTarget: rufMatch ? rufMatch[1].trim() : null
      };
    }

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (!hasDMARC || dmarcPolicy === "none") {
      status = "action";
      capability = "email_security";
    } else if (!hasSPF || !dkimIndicator) {
      status = "review";
      capability = "email_security";
    }

    // Normalize MX exchange (strip trailing dot, lowercase)
    const mxProvider = mxRecords[0]?.exchange.toLowerCase().replace(/\.$/, "") || "";
    
    // Check SPF for additional provider hints
    const spfLower = spfRecord?.toLowerCase() || "";
    
    let provider = "Unknown";
    if (mxProvider.includes("mimecast") || spfLower.includes("mimecast")) {
      provider = "Mimecast";
    } else if (mxProvider.includes("google") || mxProvider.includes("googlemail")) {
      provider = "Google Workspace";
    } else if (mxProvider.includes("outlook") || mxProvider.includes("microsoft") || mxProvider.includes("protection.outlook")) {
      provider = "Microsoft 365";
    } else if (mxProvider.includes("pphosted") || mxProvider.includes("proofpoint")) {
      provider = "Proofpoint";
    } else if (mxProvider.includes("barracuda")) {
      provider = "Barracuda";
    } else if (mxProvider.includes("messagelabs") || spfLower.includes("messagelabs")) {
      provider = "Symantec MessageLabs";
    } else if (mxProvider.includes("mailprotector")) {
      provider = "Mailprotector";
    }

    return {
      id: "email",
      label: "Email security (SPF/DKIM/DMARC)",
      status,
      data: {
        mxRecords,
        spfRecord,
        dmarcRecord,
        dmarcDetails,
        dkimIndicator,
        provider
      },
      summary: `MX: ${provider}. SPF: ${hasSPF ? "✓" : "✗"}. DKIM: ${dkimIndicator ? "✓" : "✗"}. DMARC: ${hasDMARC ? dmarcPolicy || "present" : "✗"}.`,
      capability
    };
  } catch (error) {
    return {
      id: "email",
      label: "Email security (SPF/DKIM/DMARC)",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check email security records."
    };
  }
}

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

async function getSPFRecord(domain: string): Promise<string | null> {
  try {
    const records = await resolveTXT(domain);
    const spf = records.find((r: string) => r.startsWith("v=spf1"));
    return spf || null;
  } catch {
    return null;
  }
}

async function getDMARCRecord(domain: string): Promise<string | null> {
  try {
    const records = await resolveTXT(`_dmarc.${domain}`);
    const dmarc = records.find((r: string) => r.startsWith("v=DMARC1"));
    return dmarc || null;
  } catch {
    return null;
  }
}

async function checkDKIMSetup(domain: string): Promise<boolean> {
  const commonSelectors = ["default", "google", "k1", "selector1", "selector2"];
  const checks = commonSelectors.map(async (selector) => {
    try {
      const records = await resolveTXT(`${selector}._domainkey.${domain}`);
      return records.some((r: string) => r.includes("v=DKIM1") || r.includes("k=rsa"));
    } catch {
      return false;
    }
  });
  const results = await Promise.all(checks);
  return results.some((r) => r);
}

function extractDMARCPolicy(record: string): string | null {
  const match = record.match(/p=([a-z]+)/);
  return match ? match[1] : null;
}
