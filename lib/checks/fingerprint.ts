import { CheckResult } from "../types";

export async function checkFingerprint(domain: string): Promise<CheckResult> {
  try {
    const url = `https://${domain}`;
    const response = await fetch(url, {
      redirect: "follow"
    });

    const html = await response.text();
    const headers = Object.fromEntries(response.headers.entries());

    const fingerprints: string[] = [];
    let version: string | null = null;
    let isOutdated = false;

    if (headers["x-powered-by"]) {
      fingerprints.push(`X-Powered-By: ${headers["x-powered-by"]}`);
    }

    if (headers["server"]) {
      fingerprints.push(`Server: ${headers["server"]}`);
    }

    const generatorMatch = html.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i);
    if (generatorMatch) {
      fingerprints.push(`Generator: ${generatorMatch[1]}`);
    }

    if (html.includes("/wp-content/") || html.includes("/wp-includes/")) {
      fingerprints.push("CMS: WordPress");
      const wpVersionMatch = html.match(/wp-(?:content|includes)\/[^"']*\/([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
      if (wpVersionMatch) {
        version = wpVersionMatch[1];
        const majorVersion = parseInt(version.split(".")[0]);
        if (majorVersion < 6) isOutdated = true;
      }
    } else if (html.includes("Joomla!")) {
      fingerprints.push("CMS: Joomla");
    } else if (html.includes("Drupal") || html.includes("/sites/default/files/")) {
      fingerprints.push("CMS: Drupal");
    } else if (html.includes("/_next/") || headers["x-nextjs-cache"]) {
      fingerprints.push("Framework: Next.js");
    } else if (html.includes("__nuxt")) {
      fingerprints.push("Framework: Nuxt.js");
    }

    if (html.includes("react") && !html.includes("Next.js")) {
      fingerprints.push("Library: React");
    }

    if (html.includes("Vue.js") || html.includes("data-v-")) {
      fingerprints.push("Library: Vue.js");
    }

    let status: "good" | "review" | "action" | "info" = "info";
    let capability: string | undefined;

    if (isOutdated) {
      status = "action";
      capability = "managed_security";
    } else if (fingerprints.length > 0) {
      status = "review";
      capability = "software_team";
    }

    return {
      id: "fingerprint",
      label: "CMS and technology stack",
      status,
      data: {
        fingerprints,
        version,
        isOutdated
      },
      summary: fingerprints.length > 0
        ? `Detected: ${fingerprints.join(", ")}${version ? ` (v${version})` : ""}${isOutdated ? " - OUTDATED" : ""}`
        : "No clear technology fingerprints detected.",
      capability
    };
  } catch (error) {
    return {
      id: "fingerprint",
      label: "CMS and technology stack",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not fingerprint technology stack."
    };
  }
}
