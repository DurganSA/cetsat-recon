import { CheckResult } from "../types";
import { fetchWithFallback, isCloudflareChallengePage } from "../fetch-html";

// This check reads only the homepage plus, at most, one obvious top-level page (About
// or Services) that the homepage itself links to. No crawling, no following arbitrary
// links, no probing paths that aren't advertised on the page every visitor already sees.
const MAX_TEXT_LENGTH = 1800;

const ABOUT_LINK_KEYWORDS = ["/about", "/who-we-are", "/company", "/our-story"];
const SERVICES_LINK_KEYWORDS = ["/services", "/what-we-do", "/solutions", "/products"];

function decodeEntities(text: string): string {
  let decoded = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, "-")
    // Numeric character references (&#8217; and &#x2019;) - handled generically since
    // named entities alone miss any code point a CMS happens to emit numerically.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));

  // &amp;/&lt;/&gt;/&quot;/&#39; decoded last so a double-escaped source (e.g. "&amp;amp;")
  // still ends up readable rather than partially re-escaped.
  decoded = decoded
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  return decoded;
}

// Strips scripts/styles/nav/header/footer (and their content) before stripping the
// remaining tags, so boilerplate chrome doesn't pollute the extracted copy.
function extractVisibleText(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  cleaned = cleaned.replace(/<[^>]+>/g, " ");
  cleaned = decodeEntities(cleaned);
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : undefined;
}

function extractMetaDescription(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
  }
  return undefined;
}

// Finds the first link on the homepage whose href contains one of the given keywords -
// an "obvious" top-level page the site itself points visitors to, not a guessed path.
function findObviousLink(html: string, keywords: string[]): string | undefined {
  const linkRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const href = match[1].toLowerCase();
    if (keywords.some(k => href.includes(k))) {
      return match[1];
    }
  }
  return undefined;
}

function resolveUrl(domain: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `https://${domain}${href}`;
  return `https://${domain}/${href}`;
}

// Looks for a "trusted by / our clients / customers include" section and pulls
// nearby image alt-text or link text as candidate client names. Returns an empty
// array (not a guess) when no such section is found.
function extractClientMentions(html: string): string[] {
  const sectionRe = /(trusted by|our clients|clients include|customers include|used by)/i;
  const match = html.match(sectionRe);
  if (!match || match.index === undefined) return [];

  const windowHtml = html.slice(match.index, match.index + 1500);
  const altRe = /<img[^>]+alt=["']([^"']+)["']/gi;
  const names = new Set<string>();
  let altMatch: RegExpExecArray | null;
  while ((altMatch = altRe.exec(windowHtml)) !== null) {
    const name = decodeEntities(altMatch[1]).trim();
    if (name && name.length > 1 && !/^(logo|icon|image|banner)$/i.test(name)) {
      names.add(name);
    }
  }
  return Array.from(names).slice(0, 10);
}

// Looks for a "services / what we do / solutions" heading and pulls nearby list-item
// text as candidate service names. Empty array (not a guess) when nothing is found.
function extractServiceMentions(html: string): string[] {
  const headingRe = /<h[1-3][^>]*>([^<]*(?:service|what we do|solutions)[^<]*)<\/h[1-3]>/i;
  const match = html.match(headingRe);
  if (!match || match.index === undefined) return [];

  const windowHtml = html.slice(match.index, match.index + 2000);
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const services = new Set<string>();
  let liMatch: RegExpExecArray | null;
  while ((liMatch = liRe.exec(windowHtml)) !== null) {
    const text = decodeEntities(liMatch[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (text && text.length > 2 && text.length < 100) {
      services.add(text);
    }
  }
  return Array.from(services).slice(0, 10);
}

async function fetchPage(url: string): Promise<{ html: string; challengeDetected: boolean } | null> {
  try {
    const response = await fetchWithFallback(url, { redirect: "follow" });
    const html = await response.text();
    if (isCloudflareChallengePage(html, response.headers)) {
      return { html: "", challengeDetected: true };
    }
    return { html, challengeDetected: false };
  } catch {
    return null;
  }
}

export async function checkSiteContent(domain: string): Promise<CheckResult> {
  try {
    const homepage = await fetchPage(`https://${domain}/`);

    if (!homepage) {
      return {
        id: "site_content",
        label: "Website content (for enrichment)",
        status: "info",
        data: { error: "Could not fetch homepage" },
        summary: "Could not capture website content for report enrichment."
      };
    }

    if (homepage.challengeDetected) {
      return {
        id: "site_content",
        label: "Website content (for enrichment)",
        status: "info",
        data: { error: "Bot protection detected" },
        summary: "Bot protection detected - could not capture website content for report enrichment."
      };
    }

    const { html } = homepage;
    const title = extractTitle(html);
    const metaDescription = extractMetaDescription(html);
    const homepageText = extractVisibleText(html).slice(0, MAX_TEXT_LENGTH);
    const detectedClients = extractClientMentions(html);
    const detectedServices = extractServiceMentions(html);

    // At most one extra page: About takes priority over Services if both are found,
    // since "what we do" is usually already covered by the homepage copy.
    const extraHref = findObviousLink(html, ABOUT_LINK_KEYWORDS) || findObviousLink(html, SERVICES_LINK_KEYWORDS);

    let aboutText: string | undefined;
    if (extraHref) {
      const extraPage = await fetchPage(resolveUrl(domain, extraHref));
      if (extraPage && !extraPage.challengeDetected) {
        aboutText = extractVisibleText(extraPage.html).slice(0, MAX_TEXT_LENGTH);
      }
    }

    return {
      id: "site_content",
      label: "Website content (for enrichment)",
      status: "info",
      data: {
        title,
        metaDescription,
        homepageText,
        aboutText,
        detectedClients,
        detectedServices
      },
      summary: "Captured site copy for report enrichment."
    };
  } catch (error) {
    return {
      id: "site_content",
      label: "Website content (for enrichment)",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not capture website content for report enrichment."
    };
  }
}
