import { CheckResult } from "../types";
import { fetchWithFallback, isCloudflareChallengePage } from "../fetch-html";

async function checkLlmsTxt(domain: string): Promise<{ exists: boolean; hasLinkTag: boolean; challengeDetected?: boolean }> {
  try {
    // Check if llms.txt exists
    const llmsTxtResponse = await fetchWithFallback(`https://${domain}/llms.txt`, { method: 'HEAD' });
    const exists = llmsTxtResponse.ok;

    // Check for llms link tag in HTML
    const htmlResponse = await fetchWithFallback(`https://${domain}/`, { redirect: 'follow' });
    const html = await htmlResponse.text();
    
    // Detect challenge page
    if (isCloudflareChallengePage(html, htmlResponse.headers)) {
      // Keep the llms.txt result we already got (static files often bypass bot protection)
      return { exists: exists, hasLinkTag: false, challengeDetected: true };
    }
    
    const hasLinkTag = html.includes('rel="llms"') || html.includes("rel='llms'");

    return { exists, hasLinkTag };
  } catch {
    return { exists: false, hasLinkTag: false };
  }
}

async function checkAIBotAccess(domain: string): Promise<Record<string, number>> {
  const bots = {
    "ClaudeBot": "ClaudeBot/1.0",
    "GPTBot": "GPTBot/1.0",
    "PerplexityBot": "PerplexityBot/1.0",
    "Google-Extended": "Google-Extended"
  };

  const results: Record<string, number> = {};

  for (const [name, userAgent] of Object.entries(bots)) {
    try {
      const response = await fetch(`https://${domain}/`, {
        method: 'HEAD',
        headers: { 'User-Agent': userAgent },
        redirect: 'manual'
      });
      results[name] = response.status;
    } catch {
      results[name] = 0;
    }
  }

  return results;
}

async function checkMetaTags(domain: string): Promise<{
  hasDescription: boolean;
  hasCanonical: boolean;
  hasNoindex: boolean;
  xRobotsNoindex: boolean;
  challengeDetected?: boolean;
}> {
  try {
    const response = await fetchWithFallback(`https://${domain}/`, { redirect: 'follow' });
    const html = await response.text();
    const headers = response.headers;

    // Detect challenge page
    if (isCloudflareChallengePage(html, headers)) {
      return { 
        hasDescription: false, 
        hasCanonical: false, 
        hasNoindex: false, 
        xRobotsNoindex: false,
        challengeDetected: true
      };
    }

    const hasDescription = html.includes('name="description"');
    const hasCanonical = html.includes('rel="canonical"');
    const hasNoindex = html.toLowerCase().includes('noindex');
    const xRobotsNoindex = (headers.get('x-robots-tag') || '').toLowerCase().includes('noindex');

    return { hasDescription, hasCanonical, hasNoindex, xRobotsNoindex };
  } catch {
    return { hasDescription: false, hasCanonical: false, hasNoindex: false, xRobotsNoindex: false };
  }
}

// Matches type="application/ld+json" or type='application/ld+json' - the plain
// html.includes() check used for hasJsonLd is quote-agnostic, so this regex needs to be too.
const JSON_LD_SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

// Parses every JSON-LD <script> block on the page and returns the flat list of schema
// nodes, unwrapping @graph containers and top-level arrays - most WordPress SEO plugins
// (Yoast, RankMath) emit a single {"@graph": [...]} block with no @type at the root,
// which a naive top-level json['@type'] read would always miss.
function extractJsonLdNodes(html: string): Record<string, any>[] {
  const nodes: Record<string, any>[] = [];
  const matches = html.matchAll(JSON_LD_SCRIPT_RE);

  for (const match of matches) {
    try {
      const json = JSON.parse(match[1].trim());
      const candidates = Array.isArray(json) ? json : [json];
      for (const candidate of candidates) {
        if (candidate && Array.isArray(candidate['@graph'])) {
          nodes.push(...candidate['@graph']);
        } else if (candidate) {
          nodes.push(candidate);
        }
      }
    } catch {
      // Invalid JSON, skip this block
    }
  }

  return nodes;
}

function getNodeTypes(node: Record<string, any>): string[] {
  const type = node['@type'];
  if (!type) return [];
  return Array.isArray(type) ? type.filter((t): t is string => typeof t === "string") : [type];
}

async function checkStructuredData(domain: string): Promise<{
  hasJsonLd: boolean;
  schemaTypes: string[];
  challengeDetected?: boolean;
}> {
  try {
    const response = await fetchWithFallback(`https://${domain}/`, { redirect: 'follow' });
    const html = await response.text();

    // Detect challenge page
    if (isCloudflareChallengePage(html, response.headers)) {
      return { hasJsonLd: false, schemaTypes: [], challengeDetected: true };
    }

    const hasJsonLd = html.includes('application/ld+json');
    const schemaTypes = extractJsonLdNodes(html).flatMap(getNodeTypes);

    return { hasJsonLd, schemaTypes: Array.from(new Set(schemaTypes)) };
  } catch {
    return { hasJsonLd: false, schemaTypes: [] };
  }
}

async function checkSSR(domain: string): Promise<{ hasContent: boolean; contentCount: number; challengeDetected?: boolean }> {
  try {
    const response = await fetchWithFallback(`https://${domain}/`, { redirect: 'follow' });
    const html = await response.text();

    // Detect challenge page
    if (isCloudflareChallengePage(html, response.headers)) {
      return { hasContent: false, contentCount: 0, challengeDetected: true };
    }

    // Count semantic HTML elements
    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
    const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
    const pCount = (html.match(/<p[^>]*>/gi) || []).length;
    const contentCount = h1Count + h2Count + pCount;

    const hasContent = contentCount >= 10;

    return { hasContent, contentCount };
  } catch {
    return { hasContent: false, contentCount: 0 };
  }
}

async function checkOpenGraph(domain: string): Promise<{
  hasOgTags: boolean;
  hasTitleTag: boolean;
  hasDescriptionTag: boolean;
  hasImageTag: boolean;
  hasUrlTag: boolean;
  challengeDetected?: boolean;
}> {
  try {
    const response = await fetchWithFallback(`https://${domain}/`, { redirect: 'follow' });
    const html = await response.text();

    // Detect challenge page
    if (isCloudflareChallengePage(html, response.headers)) {
      return { 
        hasOgTags: false, 
        hasTitleTag: false, 
        hasDescriptionTag: false, 
        hasImageTag: false, 
        hasUrlTag: false,
        challengeDetected: true
      };
    }

    const hasOgTags = html.includes('og:');
    const hasTitleTag = html.includes('og:title');
    const hasDescriptionTag = html.includes('og:description');
    const hasImageTag = html.includes('og:image');
    const hasUrlTag = html.includes('og:url');

    return { hasOgTags, hasTitleTag, hasDescriptionTag, hasImageTag, hasUrlTag };
  } catch {
    return { hasOgTags: false, hasTitleTag: false, hasDescriptionTag: false, hasImageTag: false, hasUrlTag: false };
  }
}

async function checkMarkdownVersions(domain: string): Promise<{ availablePages: string[] }> {
  const pagesToCheck = ['', 'about', 'services', 'products', 'contact'];
  const availablePages: string[] = [];

  for (const page of pagesToCheck) {
    try {
      const url = page ? `https://${domain}/${page}.md` : `https://${domain}/index.md`;
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        availablePages.push(page || 'index');
      }
    } catch {
      // Not available
    }
  }

  return { availablePages };
}

async function checkFAQSchema(domain: string): Promise<{ hasFAQSchema: boolean; faqCount: number; challengeDetected?: boolean }> {
  try {
    const response = await fetchWithFallback(`https://${domain}/`, { redirect: 'follow' });
    const html = await response.text();

    // Detect challenge page
    if (isCloudflareChallengePage(html, response.headers)) {
      return { hasFAQSchema: false, faqCount: 0, challengeDetected: true };
    }

    const faqNode = extractJsonLdNodes(html).find(node => getNodeTypes(node).includes('FAQPage'));
    const hasFAQSchema = faqNode !== undefined;
    const faqCount = Array.isArray(faqNode?.mainEntity) ? faqNode.mainEntity.length : 0;

    return { hasFAQSchema, faqCount };
  } catch {
    return { hasFAQSchema: false, faqCount: 0 };
  }
}

export async function checkGEO(domain: string): Promise<CheckResult> {
  try {
    const [
      llmsTxt,
      aiBotAccess,
      metaTags,
      structuredData,
      ssr,
      openGraph,
      markdownVersions,
      faqSchema
    ] = await Promise.all([
      checkLlmsTxt(domain),
      checkAIBotAccess(domain),
      checkMetaTags(domain),
      checkStructuredData(domain),
      checkSSR(domain),
      checkOpenGraph(domain),
      checkMarkdownVersions(domain),
      checkFAQSchema(domain)
    ]);

    // Detect if we got a Cloudflare challenge page
    const challengeDetected = 
      llmsTxt.challengeDetected || 
      metaTags.challengeDetected || 
      structuredData.challengeDetected || 
      ssr.challengeDetected || 
      openGraph.challengeDetected ||
      faqSchema.challengeDetected;

    if (challengeDetected) {
      // Build summary of what we could check (static files often bypass bot protection)
      const partialResults: string[] = [];
      if (llmsTxt.exists) {
        partialResults.push("llms.txt found");
      } else {
        partialResults.push("llms.txt not found");
      }
      if (markdownVersions.availablePages.length > 0) {
        partialResults.push(`${markdownVersions.availablePages.length} markdown page(s)`);
      }

      const summary = partialResults.length > 0
        ? `Bot protection detected (partial results: ${partialResults.join(", ")}). Full GEO analysis not possible.`
        : "Bot protection detected - could not analyze site (search engines typically allowed).";

      return {
        id: "geo",
        label: "AI Discoverability / GEO",
        status: "info",
        data: {
          error: "Bot protection detected",
          message: "Site is protected by Cloudflare or similar bot protection. Scanner was served a challenge page instead of real content. This prevents full GEO analysis. Note: Search engines (Google, Bing) are typically allowed through, so SEO may not be affected.",
          // Include partial results from static files that may have bypassed protection
          llmsTxt: {
            exists: llmsTxt.exists,
            hasLinkTag: false // Can't check HTML
          },
          markdownVersions: {
            availablePages: markdownVersions.availablePages
          },
          challengeDetected: true
        },
        summary
      };
    }

    const issues: string[] = [];
    const opportunities: string[] = [];

    // Critical issues
    if (!llmsTxt.exists) issues.push("llms.txt not found");
    if (!llmsTxt.hasLinkTag) issues.push("llms link tag missing");
    if (!ssr.hasContent) issues.push("insufficient HTML content (client-side rendered)");
    if (metaTags.hasNoindex || metaTags.xRobotsNoindex) issues.push("noindex detected");

    // AI bot access
    const blockedBots = Object.entries(aiBotAccess)
      .filter(([_, status]) => status !== 200 && status !== 301 && status !== 302)
      .map(([name]) => name);
    if (blockedBots.length > 0) {
      issues.push(`AI bots blocked: ${blockedBots.join(", ")}`);
    }

    // Opportunities (missing but beneficial)
    if (!metaTags.hasDescription) opportunities.push("meta description missing");
    if (!metaTags.hasCanonical) opportunities.push("canonical URL missing");
    if (!structuredData.hasJsonLd) opportunities.push("no structured data (JSON-LD)");
    if (!openGraph.hasOgTags) opportunities.push("Open Graph tags missing");
    if (markdownVersions.availablePages.length === 0) opportunities.push("no markdown page versions");
    if (!faqSchema.hasFAQSchema) opportunities.push("FAQ schema missing");

    // Determine status
    let status: "good" | "review" | "action" = "good";
    if (issues.length > 0) {
      status = issues.some(i => 
        i.includes("noindex") || 
        i.includes("client-side") || 
        i.includes("llms.txt") || 
        blockedBots.length >= 2
      ) ? "action" : "review";
    } else if (opportunities.length >= 3) {
      status = "review";
    }

    // Always emit software_team capability if there are issues or opportunities
    const capability = (issues.length > 0 || opportunities.length > 0) ? "software_team" : undefined;

    const summary = buildSummary(issues, opportunities, llmsTxt, aiBotAccess, structuredData, ssr);

    return {
      id: "geo",
      label: "AI Discoverability / GEO",
      status,
      data: {
        llmsTxt,
        aiBotAccess,
        metaTags,
        structuredData,
        ssr,
        openGraph,
        markdownVersions,
        faqSchema,
        issues,
        opportunities
      },
      summary,
      capability
    };
  } catch (error) {
    return {
      id: "geo",
      label: "AI Discoverability / GEO",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check AI discoverability."
    };
  }
}

function buildSummary(
  issues: string[],
  opportunities: string[],
  llmsTxt: any,
  aiBotAccess: any,
  structuredData: any,
  ssr: any
): string {
  const parts: string[] = [];

  if (issues.length > 0) {
    parts.push(`${issues.length} critical issue(s): ${issues.slice(0, 3).join("; ")}`);
  }

  if (opportunities.length > 0) {
    parts.push(`${opportunities.length} optimization(s): ${opportunities.slice(0, 3).join("; ")}`);
  }

  if (issues.length === 0 && opportunities.length === 0) {
    // All good
    const highlights: string[] = [];
    if (llmsTxt.exists) highlights.push("llms.txt present");
    if (structuredData.hasJsonLd) highlights.push(`${structuredData.schemaTypes.length} schema type(s)`);
    if (ssr.hasContent) highlights.push(`${ssr.contentCount} HTML elements`);
    
    const accessibleBots = Object.entries(aiBotAccess)
      .filter(([_, status]: [string, any]) => status === 200)
      .length;
    highlights.push(`${accessibleBots}/4 AI bots accessible`);

    parts.push(`AI-ready: ${highlights.join(", ")}`);
  }

  return parts.join(". ") + ".";
}
