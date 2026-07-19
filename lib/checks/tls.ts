import { CheckResult } from "../types";

const POLL_INTERVAL_MS = 10000;
// SSL Labs only returns instantly for hosts it already has a cached result for.
// A fresh host kicks off an async assessment and returns IN_PROGRESS/DNS immediately,
// so we must poll until it settles instead of taking the first response as final.
const MAX_POLL_ATTEMPTS = 18; // ~3 minutes, within the scan route's 300s budget

async function fetchAnalysis(domain: string): Promise<any> {
  const apiUrl = `https://api.ssllabs.com/api/v3/analyze?host=${domain}&fromCache=on&maxAge=24`;
  const response = await fetch(apiUrl);
  return response.json();
}

export async function checkTLS(domain: string): Promise<CheckResult> {
  try {
    let data = await fetchAnalysis(domain);

    let attempts = 0;
    while ((data.status === "IN_PROGRESS" || data.status === "DNS") && attempts < MAX_POLL_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      data = await fetchAnalysis(domain);
      attempts++;
    }

    if (data.status === "READY") {
      const grade = data.endpoints?.[0]?.grade || "Unknown";
      const hasWarnings = data.endpoints?.some((e: any) => e.hasWarnings) || false;

      // "READY" only means SSL Labs finished attempting the assessment - an endpoint can
      // still fail to connect (no grade produced). Defaulting that to "good" would be a
      // false positive, so treat an undetermined grade as informational, not a pass.
      if (grade === "Unknown") {
        const statusMessage = data.endpoints?.[0]?.statusMessage;
        return {
          id: "tls",
          label: "TLS / certificate grade",
          status: "info",
          data: { grade, endpoints: data.endpoints },
          summary: `SSL Labs could not determine a grade${statusMessage ? `: ${statusMessage}` : ""}.`
        };
      }

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
        summary: `SSL Labs scan still in progress after ${Math.round((attempts * POLL_INTERVAL_MS) / 1000)}s of polling. Try scanning again shortly.`
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
