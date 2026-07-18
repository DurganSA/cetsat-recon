# Claude API Report Enhancement (Optional)

## Overview

The basic reports are now **much more specific and actionable** with:
- ✅ Latest version checks (WordPress, etc.)
- ✅ Specific "How to Fix" steps with DNS records, server configs
- ✅ Detailed "Why it matters" with context from your scan data
- ✅ Exact commands and configurations

## Optional: AI-Enhanced Reports with Claude API

For **even deeper analysis**, you can integrate Claude API to generate fully enriched, customized reports at download time.

### What Claude API Could Add:

1. **Contextual Analysis**
   - Tailored advice based on company size, industry, tech stack
   - Risk prioritization specific to the business
   - Comparative analysis against similar companies

2. **Executive Summaries**
   - Non-technical executive briefing
   - Business impact assessment
   - Budget recommendations

3. **Technical Deep Dives**
   - Detailed exploit scenarios for each vulnerability
   - Step-by-step remediation playbooks
   - Code snippets for specific implementations

4. **Competitive Intelligence**
   - How their security compares to industry standards
   - Best practices from their sector
   - Regulatory compliance mapping (GDPR, Cyber Essentials, ISO 27001)

---

## Implementation Plan

### Step 1: Get Anthropic API Key

1. Go to: https://console.anthropic.com/
2. Create an account / sign in
3. Generate an API key
4. Add to Vercel environment variables: `ANTHROPIC_API_KEY`

### Step 2: Add Anthropic SDK

```bash
cd C:\sites\saleschecker\cetsat-recon
npm install @anthropic-ai/sdk
```

### Step 3: Create AI Report Generator

Create `lib/ai-report-enhancer.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { CheckResult } from "./types";

export async function enhanceReport(
  results: CheckResult[],
  companyInfo: {
    domain: string;
    companyName?: string;
    companiesHouseData?: any;
  }
): Promise<{
  executiveSummary: string;
  technicalAnalysis: string;
  prioritizedActions: Array<{ priority: number; action: string; impact: string }>;
  industryComparison: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const anthropic = new Anthropic({ apiKey });

  const prompt = `You are a cybersecurity consultant reviewing a security scan for ${companyInfo.domain}.

Company Information:
${JSON.stringify(companyInfo, null, 2)}

Security Scan Results:
${JSON.stringify(results, null, 2)}

Please provide:

1. EXECUTIVE SUMMARY (2-3 paragraphs)
   - Non-technical overview of security posture
   - Business risk assessment
   - Recommended next steps

2. TECHNICAL ANALYSIS
   - Detailed explanation of each finding
   - Exploit scenarios and real-world examples
   - Technical remediation steps

3. PRIORITIZED ACTIONS (top 5)
   - Ordered by risk × ease of fix
   - Estimated time and cost
   - Business impact of fixing vs not fixing

4. INDUSTRY COMPARISON
   - How this compares to typical ${companyInfo.companiesHouseData?.sicCodes?.[0] || "UK"} businesses
   - Common pitfalls in this sector
   - Compliance considerations (Cyber Essentials, GDPR, ISO 27001)

Format the response as structured JSON.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  return JSON.parse(content.text);
}
```

### Step 4: Modify Report Route

Update `app/api/report/route.ts` to optionally use AI enhancement:

```typescript
import { enhanceReport } from "@/lib/ai-report-enhancer";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { results, input, useAI } = body;

  let enrichedData = null;
  
  if (useAI && process.env.ANTHROPIC_API_KEY) {
    try {
      enrichedData = await enhanceReport(results, {
        domain: input.domain,
        companyName: input.companyName,
        companiesHouseData: results.find((r: any) => r.id === "companies_house")?.data
      });
    } catch (error) {
      console.error("AI enhancement failed:", error);
      // Fall back to standard report
    }
  }

  const reportBuffer = await generateReport(results, input, enrichedData);
  // ... rest of code
}
```

### Step 5: Add UI Toggle

Update `app/page.tsx` to add AI enhancement checkbox:

```typescript
const [useAI, setUseAI] = useState(false);

// In the download button area:
<div className="flex items-center gap-4">
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={useAI}
      onChange={(e) => setUseAI(e.target.checked)}
    />
    <span className="text-sm">
      AI-Enhanced Report
      {!process.env.NEXT_PUBLIC_HAS_ANTHROPIC_KEY && " (requires API key)"}
    </span>
  </label>
  
  <button onClick={() => handleDownloadReport(useAI)}>
    Download Report {useAI && "(AI-Enhanced)"}
  </button>
</div>
```

---

## Cost Considerations

### Standard Reports (Current)
- ✅ **FREE** - Uses only public APIs
- No per-report costs
- Instant generation

### AI-Enhanced Reports (Optional)
- 📊 **~$0.05-0.15 per report** (Claude API costs)
- Depends on report length and complexity
- Adds 5-10 seconds to generation time
- Much deeper, more tailored analysis

**Recommendation**: Offer AI-enhanced reports as a premium option or for qualified leads only.

---

## Example AI-Enhanced Report Structure

```markdown
# Security Review Report (AI-Enhanced)

## Executive Summary
[Claude generates 2-3 paragraph non-technical overview tailored to the company]

## Risk Score: 6.5/10
[Claude calculates based on findings, industry, and company context]

## Your Business Context
[Claude analyzes Companies House data, tech stack, and generates business profile]

## Findings & Recommendations
[Standard findings + Claude's deep analysis of each]

### Finding 1: WordPress Outdated (Critical)
**What we found**: WordPress 6.9.4 (Latest: 6.10.1)

**Business Impact** [Claude-generated]:
Your WordPress installation is 2 versions behind. Given your e-commerce functionality 
and customer payment processing, this represents a HIGH risk. CVE-2024-XXXX allows 
attackers to...

**How Attackers Could Exploit This** [Claude-generated]:
[Detailed attack scenario specific to their setup]

**Step-by-Step Fix** [Enhanced by Claude]:
[Detailed remediation with company-specific context]

## Prioritized Action Plan
[Claude generates risk × ease matrix specific to their situation]

1. **Update WordPress (3 hours, £0 cost, CRITICAL)**
   - Risk reduced: 65%
   - Business impact: Prevents data breach, protects customer data
   
2. **Fix DMARC (30 minutes, £0 cost, HIGH)**
   ...

## Industry Comparison
[Claude analyzes against similar businesses in their sector]

## Compliance Roadmap
[Claude maps findings to Cyber Essentials, GDPR, ISO 27001 requirements]
```

---

## When to Use AI Enhancement

**Use standard reports for**:
- Quick initial assessments
- High-volume prospecting
- Cost-sensitive scenarios

**Use AI-enhanced reports for**:
- Qualified leads ready to buy
- Complex enterprise prospects
- When you need deep technical justification
- Proposals and tenders

---

## Next Steps

1. **Test the enhanced standard reports first** (already deployed)
2. If you want AI enhancement, let me know and I'll implement it
3. You'll need an Anthropic API key (~$0.10 per report)

The standard reports are now **much better** with specific versions, exact fixes, and actionable steps. AI enhancement would take it even further with deep contextual analysis, but it's optional!
