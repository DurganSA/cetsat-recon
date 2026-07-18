import { CheckResult } from "../types";

export async function checkSafeBrowsing(domain: string): Promise<CheckResult> {
  try {
    const apiKey = process.env.SAFEBROWSING_API_KEY;

    if (!apiKey) {
      return {
        id: "safebrowsing",
        label: "Google Safe Browsing",
        status: "info",
        data: { error: "API key not configured" },
        summary: "Safe Browsing API key not configured."
      };
    }

    const url = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
    const body = {
      client: {
        clientId: "cetsat-recon",
        clientVersion: "1.0.0"
      },
      threatInfo: {
        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [
          { url: `http://${domain}` },
          { url: `https://${domain}` }
        ]
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error("Safe Browsing API query failed");
    }

    const data = await response.json();
    const matches = data.matches || [];

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (matches.length > 0) {
      status = "action";
      capability = "managed_security";
    }

    return {
      id: "safebrowsing",
      label: "Google Safe Browsing",
      status,
      data: {
        matches
      },
      summary: matches.length > 0
        ? `FLAGGED by Google Safe Browsing for: ${matches.map((m: any) => m.threatType).join(", ")}.`
        : "Clean on Google Safe Browsing.",
      capability
    };
  } catch (error) {
    return {
      id: "safebrowsing",
      label: "Google Safe Browsing",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check Safe Browsing status."
    };
  }
}
