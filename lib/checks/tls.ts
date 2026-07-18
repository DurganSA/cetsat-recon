import { CheckResult } from "../types";

export async function checkTLS(domain: string): Promise<CheckResult> {
  try {
    const apiUrl = `https://api.ssllabs.com/api/v3/analyze?host=${domain}&fromCache=on&maxAge=24`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.status === "READY") {
      const grade = data.endpoints?.[0]?.grade || "Unknown";
      const hasWarnings = data.endpoints?.some((e: any) => e.hasWarnings) || false;

      let status: "good" | "review" | "action" = "good";
      let capability: string | undefined;

      if (grade === "F" || grade === "T") {
        status = "action";
        capability = "managed_security";
      } else if (grade === "C" || grade === "D" || hasWarnings) {
        status = "review";
        capability = "managed_security";
      }

      return {
        id: "tls",
        label: "TLS / certificate grade",
        status,
        data: {
          grade,
          endpoints: data.endpoints
        },
        summary: `SSL Labs grade: ${grade}${hasWarnings ? " (with warnings)" : ""}.`,
        capability
      };
    } else if (data.status === "IN_PROGRESS" || data.status === "DNS") {
      return {
        id: "tls",
        label: "TLS / certificate grade",
        status: "info",
        data: { status: data.status },
        summary: "SSL Labs scan in progress. This can take 1-2 minutes."
      };
    } else {
      return {
        id: "tls",
        label: "TLS / certificate grade",
        status: "info",
        data: { status: data.status, statusMessage: data.statusMessage },
        summary: `SSL Labs scan not ready: ${data.statusMessage || data.status}`
      };
    }
  } catch (error) {
    return {
      id: "tls",
      label: "TLS / certificate grade",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check TLS certificate."
    };
  }
}
