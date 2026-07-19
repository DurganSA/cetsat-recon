import { CheckResult } from "../types";

async function getLatestWordPressVersion(): Promise<string | null> {
  try {
    const response = await fetch("https://api.wordpress.org/core/version-check/1.7/");
    const data = await response.json();
    return data.offers?.[0]?.version || null;
  } catch {
    return null;
  }
}

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
    let latestVersion: string | null = null;
    let isOutdated = false;
    let cmsType: string | null = null;

    if (headers["x-powered-by"]) {
      fingerprints.push(`X-Powered-By: ${headers["x-powered-by"]}`);
    }

    if (headers["server"]) {
      fingerprints.push(`Server: ${headers["server"]}`);
    }

    const generatorMatch = html.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i);
    if (generatorMatch) {
      fingerprints.push(`Generator: ${generatorMatch[1]}`);
      
      // Extract WordPress version from generator tag
      const wpGenMatch = generatorMatch[1].match(/WordPress\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
      if (wpGenMatch) {
        version = wpGenMatch[1];
        cmsType = "WordPress";
      }
    }

    if (html.includes("/wp-content/") || html.includes("/wp-includes/")) {
      if (!cmsType) {
        fingerprints.push("CMS: WordPress");
        cmsType = "WordPress";
      }
      
      // Try to extract version from paths if not found in generator
      if (!version) {
        const wpVersionMatch = html.match(/wp-(?:content|includes)\/[^"']*\/([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
        if (wpVersionMatch) {
          version = wpVersionMatch[1];
        }
      }
    }

    // Fetch latest WordPress version if WordPress detected
    if (cmsType === "WordPress") {
      latestVersion = await getLatestWordPressVersion();
      
      if (version && latestVersion) {
        const [currentMajor, currentMinor] = version.split(".").map(Number);
        const [latestMajor, latestMinor] = latestVersion.split(".").map(Number);
        
        // Check if outdated (major version behind or more than 2 minor versions behind)
        if (currentMajor < latestMajor || (currentMajor === latestMajor && currentMinor < latestMinor - 2)) {
          isOutdated = true;
        }
      }
    }

    if (html.includes("Joomla!")) {
      fingerprints.push("CMS: Joomla");
      cmsType = "Joomla";
    } else if (html.includes("Drupal") || html.includes("/sites/default/files/")) {
      fingerprints.push("CMS: Drupal");
      cmsType = "Drupal";
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
    } else if (fingerprints.length > 0 && version && latestVersion && version !== latestVersion) {
      status = "review";
      capability = "software_team";
    } else if (fingerprints.length > 0) {
      // Something was detected and nothing is outdated/concerning about it - this is a
      // clean result, not merely "info". Comparison scoring excludes "info" entirely, so
      // leaving this as "info" made an up-to-date stack unable to ever win a competitor
      // comparison against an outdated one.
      status = "good";
    }

    let summary = "";
    if (fingerprints.length > 0) {
      summary = `Detected: ${fingerprints.join(", ")}`;
      if (version) {
        summary += ` (v${version})`;
      }
      if (latestVersion && version !== latestVersion) {
        summary += ` - Latest: v${latestVersion}`;
      }
      if (isOutdated) {
        summary += " - OUTDATED (security risk)";
      } else if (version && latestVersion && version !== latestVersion) {
        summary += " - Update available";
      }
    } else {
      summary = "No clear technology fingerprints detected.";
    }

    return {
      id: "fingerprint",
      label: "CMS and technology stack",
      status,
      data: {
        fingerprints,
        version,
        latestVersion,
        isOutdated,
        cmsType
      },
      summary,
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
