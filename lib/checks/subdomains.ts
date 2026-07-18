import { CheckResult } from "../types";

export async function checkSubdomains(domain: string): Promise<CheckResult> {
  try {
    const response = await fetch(`https://crt.sh/?q=%.${domain}&output=json`);

    if (!response.ok) {
      throw new Error("crt.sh query failed");
    }

    const data = await response.json();

    const subdomains = new Set<string>();
    data.forEach((cert: any) => {
      const names = cert.name_value.split("\n");
      names.forEach((name: string) => {
        const cleaned = name.trim().toLowerCase();
        if (cleaned.endsWith(`.${domain}`) && cleaned !== domain) {
          subdomains.add(cleaned);
        }
      });
    });

    const subdomainList = Array.from(subdomains).sort();
    const sensitiveSubdomains = subdomainList.filter(s =>
      s.includes("dev") ||
      s.includes("staging") ||
      s.includes("test") ||
      s.includes("admin") ||
      s.includes("internal")
    );

    let status: "good" | "review" | "action" | "info" = "info";
    let capability: string | undefined;

    if (sensitiveSubdomains.length > 0) {
      status = "review";
      capability = "managed_security";
    }

    return {
      id: "subdomains",
      label: "Subdomains",
      status,
      data: {
        count: subdomainList.length,
        subdomains: subdomainList,
        sensitive: sensitiveSubdomains
      },
      summary: `Found ${subdomainList.length} subdomain(s) in certificate logs${sensitiveSubdomains.length > 0 ? `, including ${sensitiveSubdomains.length} potentially sensitive` : ""}.`,
      capability
    };
  } catch (error) {
    return {
      id: "subdomains",
      label: "Subdomains",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not retrieve subdomain information."
    };
  }
}
