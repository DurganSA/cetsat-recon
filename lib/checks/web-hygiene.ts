import { CheckResult } from "../types";

export async function checkWebHygiene(domain: string): Promise<CheckResult> {
  try {
    const [httpsEnforcement, cookiesBeforeConsent] = await Promise.all([
      checkHTTPSEnforcement(domain),
      checkCookiesBeforeConsent(domain)
    ]);

    const issues: string[] = [];
    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (!httpsEnforcement) {
      issues.push("HTTP not redirected to HTTPS");
      status = "review";
      capability = "managed_security";
    }

    if (cookiesBeforeConsent) {
      issues.push("Non-essential cookies set before consent");
      status = "review";
      capability = capability || "software_team";
    }

    return {
      id: "web_hygiene",
      label: "Web hygiene",
      status,
      data: {
        httpsEnforcement,
        cookiesBeforeConsent
      },
      summary: issues.length > 0
        ? `Web hygiene issues: ${issues.join(", ")}.`
        : "HTTPS enforced and cookies handled correctly.",
      capability
    };
  } catch (error) {
    return {
      id: "web_hygiene",
      label: "Web hygiene",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check web hygiene."
    };
  }
}

async function checkHTTPSEnforcement(domain: string): Promise<boolean> {
  try {
    const response = await fetch(`http://${domain}`, {
      redirect: "manual"
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      return location ? location.startsWith("https://") : false;
    }

    return false;
  } catch {
    return false;
  }
}

async function checkCookiesBeforeConsent(domain: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${domain}`, {
      redirect: "follow"
    });

    const setCookieHeaders = response.headers.get("set-cookie");
    if (!setCookieHeaders) return false;

    const essentialCookieNames = ["session", "csrf", "xsrf", "__cf", "__cflb", "__cfruid"];
    const cookies = setCookieHeaders.toLowerCase();

    return !essentialCookieNames.some(name => cookies.includes(name));
  } catch {
    return false;
  }
}
