import { CheckResult } from "../types";

export async function checkExposure(domain: string): Promise<CheckResult> {
  try {
    const response = await fetch(`https://internetdb.shodan.io/${domain}`);

    if (response.status === 404) {
      return {
        id: "exposure",
        label: "Internet-facing services",
        status: "good",
        data: { ports: [], services: [], cves: [] },
        summary: "No internet-facing services detected by Shodan."
      };
    }

    if (!response.ok) {
      throw new Error("Shodan InternetDB query failed");
    }

    const data = await response.json();

    const ports = data.ports || [];
    const vulns = data.vulns || [];
    const tags = data.tags || [];

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (vulns.length > 0) {
      status = "action";
      capability = "edr_xdr";
    } else if (ports.length > 5) {
      status = "review";
      capability = "managed_security";
    }

    return {
      id: "exposure",
      label: "Internet-facing services",
      status,
      data: {
        ports,
        vulns,
        tags
      },
      summary: `${ports.length} open port(s) detected${vulns.length > 0 ? `, ${vulns.length} known CVE(s)` : ""}.`,
      capability
    };
  } catch (error) {
    return {
      id: "exposure",
      label: "Internet-facing services",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check internet exposure."
    };
  }
}
