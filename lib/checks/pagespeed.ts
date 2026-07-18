import { CheckResult } from "../types";

export async function checkPageSpeed(domain: string): Promise<CheckResult> {
  try {
    const apiKey = process.env.PAGESPEED_API_KEY || "";
    const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${domain}&category=performance&category=seo&category=accessibility&strategy=mobile${apiKey ? `&key=${apiKey}` : ""}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("PageSpeed API query failed");
    }

    const data = await response.json();

    const performanceScore = Math.round((data.lighthouseResult?.categories?.performance?.score || 0) * 100);
    const seoScore = Math.round((data.lighthouseResult?.categories?.seo?.score || 0) * 100);
    const accessibilityScore = Math.round((data.lighthouseResult?.categories?.accessibility?.score || 0) * 100);

    const audits = data.lighthouseResult?.audits || {};
    const opportunities = Object.entries(audits)
      .filter(([_, audit]: [string, any]) => audit.details?.type === "opportunity" && audit.numericValue > 0)
      .map(([key, audit]: [string, any]) => ({
        id: key,
        title: audit.title,
        description: audit.description,
        savings: audit.displayValue
      }))
      .slice(0, 3);

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (performanceScore < 50 || seoScore < 50) {
      status = "action";
      capability = "software_team";
    } else if (performanceScore < 70 || seoScore < 70) {
      status = "review";
      capability = "software_team";
    }

    return {
      id: "pagespeed",
      label: "Mobile performance",
      status,
      data: {
        performanceScore,
        seoScore,
        accessibilityScore,
        opportunities
      },
      summary: `Performance: ${performanceScore}/100, SEO: ${seoScore}/100, Accessibility: ${accessibilityScore}/100.`,
      capability
    };
  } catch (error) {
    return {
      id: "pagespeed",
      label: "Mobile performance",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check page speed."
    };
  }
}
