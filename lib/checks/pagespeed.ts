import { CheckResult } from "../types";

async function fetchPageSpeed(domain: string, strategy: "mobile" | "desktop", apiKey: string) {
  const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${domain}&category=performance&category=seo&category=accessibility&strategy=${strategy}${apiKey ? `&key=${apiKey}` : ""}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`PageSpeed API query failed for ${strategy}`);
  }
  
  const data = await response.json();
  
  return {
    performanceScore: Math.round((data.lighthouseResult?.categories?.performance?.score || 0) * 100),
    seoScore: Math.round((data.lighthouseResult?.categories?.seo?.score || 0) * 100),
    accessibilityScore: Math.round((data.lighthouseResult?.categories?.accessibility?.score || 0) * 100),
    audits: data.lighthouseResult?.audits || {}
  };
}

export async function checkPageSpeed(domain: string): Promise<CheckResult> {
  try {
    const apiKey = process.env.PAGESPEED_API_KEY || "";
    
    // Fetch both mobile and desktop in parallel
    const [mobileData, desktopData] = await Promise.all([
      fetchPageSpeed(domain, "mobile", apiKey),
      fetchPageSpeed(domain, "desktop", apiKey)
    ]);

    // Extract opportunities from mobile audit (typically has more detail)
    const opportunities = Object.entries(mobileData.audits)
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

    const avgPerformance = Math.round((mobileData.performanceScore + desktopData.performanceScore) / 2);
    const avgSeo = Math.round((mobileData.seoScore + desktopData.seoScore) / 2);

    if (avgPerformance < 50 || avgSeo < 50) {
      status = "action";
      capability = "software_team";
    } else if (avgPerformance < 70 || avgSeo < 70) {
      status = "review";
      capability = "software_team";
    }

    return {
      id: "pagespeed",
      label: "Page performance & SEO",
      status,
      data: {
        mobile: {
          performanceScore: mobileData.performanceScore,
          seoScore: mobileData.seoScore,
          accessibilityScore: mobileData.accessibilityScore
        },
        desktop: {
          performanceScore: desktopData.performanceScore,
          seoScore: desktopData.seoScore,
          accessibilityScore: desktopData.accessibilityScore
        },
        opportunities
      },
      summary: `Mobile: ${mobileData.performanceScore}/100 perf, ${mobileData.seoScore}/100 SEO. Desktop: ${desktopData.performanceScore}/100 perf, ${desktopData.seoScore}/100 SEO.`,
      capability
    };
  } catch (error) {
    return {
      id: "pagespeed",
      label: "Page performance & SEO",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check page speed."
    };
  }
}
