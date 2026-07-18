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

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (!hasDMARC || dmarcPolicy === "none") {
      status = "action";
      capability = "email_security";
    } else if (!hasSPF || !dkimIndicator) {
      status = "review";
      capability = "email_security";
    }

    const mxProvider = mxRecords[0]?.exchange.toLowerCase() || "";
    let provider = "Unknown";
    if (mxProvider.includes("google.com") || mxProvider.includes("googlemail.com")) {
      provider = "Google Workspace";
    } else if (mxProvider.includes("outlook.com") || mxProvider.includes("microsoft.com")) {
      provider = "Microsoft 365";
    } else if (mxProvider.includes("pphosted.com") || mxProvider.includes("proofpoint.com")) {
      provider = "Proofpoint";
    }

    return {
      id: "email",
      label: "Email security (SPF/DKIM/DMARC)",
      status,
      data: {
        mxRecords,
        spfRecord,
        dmarcRecord,
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
