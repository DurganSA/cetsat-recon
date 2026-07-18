# AI Discoverability / GEO Check - Implementation Documentation

**Version:** 1.0  
**Deployed:** 2026-07-18  
**File:** `lib/checks/geo.ts`  
**Priority:** 12 (between Safe Browsing and Page Speed)

---

## Overview

The GEO (Generative Engine Optimization) check evaluates a website's visibility and citability by AI systems (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) alongside traditional search engines.

**Why this matters:**
- AI-referred visitors convert at **18%** vs 2-5% from traditional search
- **58%** of users have replaced traditional search with AI tools
- **69%** of Google searches now end without a click (AI generates the answer)
- Early-mover advantage window: **6-12 months**

This check identifies clients who are invisible to AI systems and creates `software_team` opportunities to modernize their content discovery strategy.

---

## The 8 Sub-Checks

### 1. llms.txt Check

**What it checks:**
- Does `https://example.com/llms.txt` exist?
- Does the HTML `<head>` contain `<link rel="llms" href="/llms.txt">`?

**Why it matters:**
- llms.txt is the "sitemap.xml for AI systems"
- Proposed by Jeremy Howard (fast.ai) in September 2024
- Adopted by Anthropic, Cloudflare, Stripe, and 844,000+ websites
- Provides AI crawlers with a structured, curated summary of the site

**Status impact:**
- Missing llms.txt → Critical issue → **action** status
- Missing link tag → Opportunity

**Data output:**
```json
{
  "llmsTxt": {
    "exists": false,
    "hasLinkTag": false
  }
}
```

---

### 2. AI Bot Access

**What it checks:**
Tests if these AI crawlers can access the homepage:
- **ClaudeBot** (Anthropic Claude)
- **GPTBot** (OpenAI ChatGPT)
- **PerplexityBot** (Perplexity AI)
- **Google-Extended** (Google Gemini + Bard)

**Why it matters:**
- Cloudflare changed defaults in late 2025 to **block AI bots automatically**
- Even if robots.txt allows them, CDN/WAF may return 403 before crawler reaches server
- Blocking AI bots = invisible to ChatGPT, Claude, Perplexity, Gemini

**Status impact:**
- 2+ bots blocked → Critical issue → **action** status
- 1 bot blocked → **review** status

**Data output:**
```json
{
  "aiBotAccess": {
    "ClaudeBot": 200,
    "GPTBot": 403,
    "PerplexityBot": 200,
    "Google-Extended": 200
  }
}
```

---

### 3. Meta Tags

**What it checks:**
- Meta description present?
- Canonical URL present?
- **noindex** tag present (killer)?
- **X-Robots-Tag: noindex** header present (killer)?

**Why it matters:**
- **noindex** is the #1 killer of AI discoverability
- Often left from development/staging and forgotten
- Can be in HTML `<meta name="robots" content="noindex">` OR HTTP header `X-Robots-Tag: noindex`
- Both search engines and AI systems obey noindex

**Status impact:**
- noindex detected → Critical issue → **action** status
- Missing description/canonical → Opportunity

**Data output:**
```json
{
  "metaTags": {
    "hasDescription": true,
    "hasCanonical": true,
    "hasNoindex": false,
    "xRobotsNoindex": false
  }
}
```

---

### 4. Structured Data (JSON-LD)

**What it checks:**
- Does the HTML contain `<script type="application/ld+json">` tags?
- What schema types are present? (Organization, Service, Product, FAQPage, etc.)

**Why it matters:**
- Structured data helps AI understand page content and context
- AI systems prefer sources with explicit semantic markup
- Schema types signal content type (company info, product details, FAQs, articles)

**Status impact:**
- Missing structured data → Opportunity

**Data output:**
```json
{
  "structuredData": {
    "hasJsonLd": true,
    "schemaTypes": ["Organization", "Service", "FAQPage"]
  }
}
```

---

### 5. SSR / Content Check

**What it checks:**
- Counts semantic HTML elements in the raw HTML response: `<h1>`, `<h2>`, `<p>`
- Threshold: **10+ elements** = has content

**Why it matters:**
- Client-side only SPAs (React, Vue, Angular without SSR) return empty HTML shells
- Initial response is just `<div id="root"></div>` and `<script>` tags
- AI crawlers see **zero content** (they don't execute JavaScript)
- Search engines and AI crawlers **require real HTML content**

**Status impact:**
- Content count < 10 → Critical issue → **action** status
- This is often a show-stopper for AI discoverability

**Data output:**
```json
{
  "ssr": {
    "hasContent": true,
    "contentCount": 42
  }
}
```

**Manual verification:**
```bash
curl -s https://example.com/ | grep -c '<h1\|<h2\|<p'
```

If result is 0-5, the site needs SSR/SSG enabled.

---

### 6. Open Graph Tags

**What it checks:**
- Does the HTML contain Open Graph tags?
- Specifically: `og:title`, `og:description`, `og:image`, `og:url`

**Why it matters:**
- Critical for social sharing (LinkedIn, X/Twitter, Slack)
- AI systems use OG tags for preview generation
- LinkedIn Post Inspector relies on OG tags
- Missing OG tags = broken link previews = unprofessional appearance

**Status impact:**
- Missing OG tags → Opportunity

**Data output:**
```json
{
  "openGraph": {
    "hasOgTags": true,
    "hasTitleTag": true,
    "hasDescriptionTag": true,
    "hasImageTag": false,
    "hasUrlTag": true
  }
}
```

---

### 7. Markdown Versions

**What it checks:**
Tests if markdown versions of key pages exist:
- `index.md`
- `about.md`
- `services.md`
- `products.md`
- `contact.md`

**Why it matters:**
- AI crawlers extract content from HTML, but complex layouts, JavaScript, navigation, cookie banners create noise
- Clean markdown versions give AI systems **direct access to actual content**
- No navigation, no footer, no scripts = pure content
- Significantly improves AI citation accuracy

**Status impact:**
- Missing markdown versions → Opportunity

**Data output:**
```json
{
  "markdownVersions": {
    "availablePages": ["index", "about"]
  }
}
```

**Implementation notes:**
Can be served as static `.md` files or via middleware that:
1. Detects requests ending in `.md`
2. Fetches corresponding page content
3. Strips HTML to markdown
4. Returns with `Content-Type: text/markdown` and `X-Robots-Tag: noindex`

The `noindex` header prevents Google treating markdown as duplicate content.

---

### 8. FAQ Schema

**What it checks:**
- Does the HTML contain `FAQPage` JSON-LD schema?
- How many FAQ questions are defined?

**Why it matters:**
- FAQ sections are **gold for GEO**
- AI engines love question-answer pairs (they map directly to user queries)
- FAQPage schema makes Q&A pairs machine-readable
- Dramatically increases AI citation rate for "how to", "what is", "does X support Y" queries

**Status impact:**
- Missing FAQ schema → Opportunity

**Data output:**
```json
{
  "faqSchema": {
    "hasFAQSchema": true,
    "faqCount": 8
  }
}
```

**Example FAQ schema:**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is Cetsat Recon?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Cetsat Recon is a prospect security review tool..."
      }
    }
  ]
}
</script>
```

---

## Status Determination Logic

The check determines status based on severity and quantity of issues:

```typescript
let status: "good" | "review" | "action" = "good";

// Critical issues → action
if (issues.length > 0) {
  const hasCritical = issues.some(i => 
    i.includes("noindex") ||           // Search engines will not index
    i.includes("client-side") ||       // AI crawlers see zero content
    i.includes("llms.txt") ||          // Missing AI discovery file
    blockedBots.length >= 2            // Multiple AI systems blocked
  );
  
  status = hasCritical ? "action" : "review";
}

// Many opportunities → review
else if (opportunities.length >= 3) {
  status = "review";
}
```

**action** = Critical issues that prevent AI discoverability
**review** = Multiple optimization opportunities
**good** = AI-ready (or only 1-2 minor improvements)

---

## Capability Tagging

The check **always emits `software_team` capability** when issues or opportunities exist:

```typescript
const capability = (issues.length > 0 || opportunities.length > 0) 
  ? "software_team" 
  : undefined;
```

**Rationale:**
- This is an **opportunity stream**, not just a security stream
- Even "good" sites can benefit from GEO optimization
- GEO is a software/development service, not managed security
- Enables LLM to pitch Cetsat's software team even when status is "good"

---

## Summary Format

The summary follows this pattern:

**If issues:**
```
"2 critical issue(s): llms.txt not found; AI bots blocked: GPTBot, ClaudeBot."
```

**If opportunities:**
```
"4 optimization(s): meta description missing; FAQ schema missing; no markdown page versions."
```

**If all good:**
```
"AI-ready: llms.txt present, 3 schema type(s), 42 HTML elements, 4/4 AI bots accessible."
```

---

## JSON Output Structure

Full data output for LLM consumption:

```json
{
  "id": "geo",
  "label": "AI Discoverability / GEO",
  "status": "action",
  "capability": "software_team",
  "summary": "2 critical issue(s): llms.txt not found; AI bots blocked: GPTBot. 3 optimization(s): FAQ schema missing; no markdown page versions; no structured data (JSON-LD).",
  "data": {
    "llmsTxt": {
      "exists": false,
      "hasLinkTag": false
    },
    "aiBotAccess": {
      "ClaudeBot": 200,
      "GPTBot": 403,
      "PerplexityBot": 200,
      "Google-Extended": 200
    },
    "metaTags": {
      "hasDescription": true,
      "hasCanonical": true,
      "hasNoindex": false,
      "xRobotsNoindex": false
    },
    "structuredData": {
      "hasJsonLd": false,
      "schemaTypes": []
    },
    "ssr": {
      "hasContent": true,
      "contentCount": 42
    },
    "openGraph": {
      "hasOgTags": true,
      "hasTitleTag": true,
      "hasDescriptionTag": true,
      "hasImageTag": false,
      "hasUrlTag": true
    },
    "markdownVersions": {
      "availablePages": []
    },
    "faqSchema": {
      "hasFAQSchema": false,
      "faqCount": 0
    },
    "issues": [
      "llms.txt not found",
      "AI bots blocked: GPTBot"
    ],
    "opportunities": [
      "FAQ schema missing",
      "no markdown page versions",
      "no structured data (JSON-LD)"
    ]
  }
}
```

---

## Common GEO Issues by Industry

### B2B SaaS / Tech Companies
**Most common issues:**
1. Client-side only React app (no SSR) → AI crawlers see zero content
2. Cloudflare blocking AI bots by default
3. Missing llms.txt (new standard, not widely adopted yet)
4. No FAQ schema (common on marketing sites)

**Quick wins:**
- Enable Next.js SSR or Gatsby static generation
- Update Cloudflare bot settings to allow AI crawlers
- Create llms.txt with product/service pages
- Add FAQ section with FAQPage schema

### Professional Services / Consultancies
**Most common issues:**
1. Missing structured data (no Organization or Service schema)
2. No markdown versions (content buried in complex layouts)
3. Missing OG images (LinkedIn previews broken)
4. Thin meta descriptions or none at all

**Quick wins:**
- Add Organization schema with services and expertise
- Create markdown versions of key service pages
- Generate OG images (1200x630px) with branding
- Write unique meta descriptions per page

### E-commerce / Retail
**Most common issues:**
1. Product pages with insufficient structured data
2. No Product schema or incomplete price/availability
3. Client-side navigation breaking crawlers
4. Missing canonical URLs (duplicate content)

**Quick wins:**
- Add Product schema to all product pages
- Implement server-side rendering for product pages
- Add canonical URLs to all pages
- Create FAQ sections for common product questions

---

## Testing the GEO Check

### 1. Test llms.txt
```bash
curl -sI https://example.com/llms.txt
curl -s https://example.com/ | grep -i 'rel="llms"'
```

### 2. Test AI bot access
```bash
curl -s -o /dev/null -w "%{http_code}" -A "ClaudeBot/1.0" https://example.com/
curl -s -o /dev/null -w "%{http_code}" -A "GPTBot/1.0" https://example.com/
```
Both should return **200** (or 301/302 redirect).

### 3. Test SSR/content
```bash
curl -s https://example.com/ | grep -c '<h1\|<h2\|<p'
```
Result should be **10+**. If 0-5, the site needs SSR/SSG.

### 4. Test structured data
```bash
curl -s https://example.com/ | grep -c 'application/ld+json'
```
Result should be **1+**.

### 5. Test markdown versions
```bash
curl -sI https://example.com/index.md
curl -sI https://example.com/about.md
```

---

## Performance Notes

All 8 sub-checks run **in parallel** using `Promise.all()`:

```typescript
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
```

**Estimated runtime:** 2-4 seconds (limited by slowest HTTP request)

**HTTP requests made:** ~10-15 per scan
- 1-2 for llms.txt check
- 4 for AI bot access check (one per bot)
- 1 for meta tags / structured data / SSR / Open Graph / FAQ (same fetch, analyzed differently)
- 5 for markdown versions check (one per page)

---

## Capability Mapping

| Capability | When Triggered | Service Angle |
|------------|----------------|---------------|
| `software_team` | Always (when issues or opportunities exist) | GEO optimization, SSR implementation, structured data, content strategy, modern web architecture |

---

## Integration with LLM Workflow

### JSON Export Button
The frontend already has a "Download JSON" button that exports scan results.

### AI-Enhanced Letter Workflow
1. **Run scan** → Get findings
2. **Download JSON** → Includes GEO check with full data
3. **Paste into Claude.ai / ChatGPT** → Use `AI-REPORT-PROMPT.md`
4. **LLM extracts GEO opportunities** → Contextual pitches:
   - "Your site is invisible to AI systems (ChatGPT, Claude, Perplexity)"
   - "AI-referred visitors convert at 18% vs 2-5% from traditional search"
   - "We can implement llms.txt, enable SSR, add structured data, and create markdown versions"
   - "Early-mover advantage window: 6-12 months"

### Example LLM Output
```
Dear [Contact],

I noticed [Company] is currently invisible to AI search systems like ChatGPT,
Claude, and Perplexity. This matters because:

- 58% of users now prefer AI tools over Google for product discovery
- AI-referred visitors convert at 18% vs 2-5% from traditional search
- 69% of Google searches now end without a click (AI generates the answer)

Specific issues I found:
1. No llms.txt file (the new standard for AI discovery)
2. GPTBot is being blocked by your CDN (likely Cloudflare default)
3. Your site is client-side rendered only, so AI crawlers see zero content
4. Missing structured data to help AI understand your services

We can fix all of this in 1-2 weeks. The early-mover advantage window is only
6-12 months before this becomes table stakes.

Interested in a quick call to discuss?

Best,
[Your name]
```

---

## Related Files

- **Implementation:** `lib/checks/geo.ts`
- **Registry:** `lib/checks/index.ts`
- **Types:** `lib/types.ts`
- **Brief:** `AI-Discoverability-GEO-Brief-Generic.md` (source material)
- **Prompt:** `AI-REPORT-PROMPT.md` (LLM letter template)

---

## Next Steps After Deployment

1. ✅ Deployed to production (Vercel auto-deploy from GitHub)
2. **Test with cetsat.com scan** (known GEO issues)
3. **Test with well-optimized site** (e.g., stripe.com, anthropic.com - both have llms.txt)
4. **Verify JSON output structure**
5. **Test LLM extraction** (paste JSON into Claude.ai, check if GEO opportunities surface)
6. **Monitor real prospect scans** for common GEO patterns
7. **Refine opportunity thresholds** based on real data

---

*GEO Check Implementation Documentation v1.0*  
*Deployed: 2026-07-18*  
*Author: Droid (Factory AI)*  
*Commit: d293ac0*
