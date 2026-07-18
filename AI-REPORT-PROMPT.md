# AI Report Generation Prompt Template

Copy this prompt and paste into Claude.ai, ChatGPT, or any AI tool along with your JSON export.

---

## 🤖 PASTE THIS INTO AI TOOL:

```
You are a cybersecurity consultant creating an executive-ready security review report for a UK business.

INSTRUCTIONS:
1. Read the scan data below
2. Generate a comprehensive, professional report
3. Write for business decision-makers (non-technical)
4. Be honest and helpful, not sales-y
5. Use British English spelling
6. Focus on business impact, not just technical details

---

SCAN DATA:
[PASTE YOUR JSON EXPORT HERE]

---

Generate a report with these sections:

# EXECUTIVE SUMMARY
- 2-3 paragraph overview written for the Managing Director
- Overall security posture: Strong/Adequate/Concerning/Critical
- Business risk assessment
- Top 3 priorities with impact on operations
- Recommended timeline and rough budget

# COMPANY PROFILE
Based on the Companies House data and domain analysis:
- Business overview (size, age, sector)
- Digital presence summary
- Technology stack identified
- Industry context

# DETAILED FINDINGS

For each "action" or "review" finding in the data:

## [Finding Name]

**Status**: [Critical/High/Medium/Low]

**What we found**:
[Technical summary from the scan data]

**What it means for your business**:
[Non-technical explanation of business impact]

**Real-world scenario**:
[Concrete example: "An attacker could... leading to..."]

**How to fix it**:
[Step-by-step instructions with timeline]
- Estimated time: X hours/days
- Estimated cost: £X or internal resource
- Risk reduction: High/Medium/Low

**Priority**: [This week / This month / This quarter]

---

# RISK PRIORITY MATRIX

Organize all findings into urgency categories:

## Immediate Action (This Week)
1. [Finding] - Impact: [X], Effort: [Y], Cost: [£Z]
2. ...

## Short Term (This Month)
1. ...

## Medium Term (This Quarter)
1. ...

## Long Term (6 Months)
1. ...

---

# INDUSTRY COMPARISON

Compare this security posture to:
- Typical businesses of similar size in the UK
- Common vulnerabilities in their sector (based on SIC codes if available)
- Where they're ahead/behind peers
- Industry-specific threats

---

# COMPLIANCE & CERTIFICATION READMAP

Map findings to UK compliance requirements:

**Cyber Essentials Basic** (£300 cert cost):
- [✓/✗] Technical controls in place
- Gap: [What's missing]
- Effort to achieve: [X days]

**Cyber Essentials Plus** (£1,000-2,000 cert cost):
- Similar analysis

**GDPR Article 32** (Security of Processing):
- Current compliance level
- Risks and gaps

**ISO 27001** (if relevant):
- Current maturity level
- Path to certification

---

# BUDGET PROPOSAL

Present three tiers:

## Essential Security (£X,XXX)
Must-do fixes to prevent breaches:
- [List items with costs]
- Total time: X days
- Risk reduction: Prevents immediate threats

## Recommended Security (£Y,YYY)
Best practice posture:
- [List items with costs]
- Total time: Y days
- Risk reduction: Industry-standard protection

## Advanced Security (£Z,ZZZ)
Enterprise-grade protection:
- [List items with costs]
- Total time: Z days
- Risk reduction: Top-tier security

---

# RECOMMENDATIONS & NEXT STEPS

## Immediate Actions (No Cost)
Things they can do today:
1. [Action item]
2. [Action item]

## 30-Day Action Plan
1. Week 1: [Actions]
2. Week 2: [Actions]
3. Week 3: [Actions]
4. Week 4: [Actions]

## Long-Term Security Roadmap
- Quarter 1: [Focus areas]
- Quarter 2: [Focus areas]
- Quarter 3-4: [Focus areas]

## Offer for Support
"We'd be happy to walk you through these findings in a 30-minute call. No obligation, no sales pitch until you ask for one. Let us know if you'd like to book that in."

---

WRITING GUIDELINES:
- Use "we found" not "you have vulnerabilities"
- Explain jargon: "DMARC (email authentication that prevents impersonation)"
- Give concrete examples: "This means an attacker could impersonate your Managing Director in an email to your finance team asking for a payment"
- Be specific about costs and timelines
- Include both DIY instructions and "or we can help with this"
- Reference UK context (GDPR, Cyber Essentials, ICO, NCSC guidance)
- Honest caveat: "This is an outside view. A proper assessment would require access to your systems"

FORMAT:
- Professional markdown
- Clear section headings
- Bullet points for readability
- Tables where appropriate
- Ready to convert to PDF or Word
```

---

## Usage Instructions

### Step 1: Run Scan
1. Go to your deployed Cetsat-Recon site
2. Enter domain and company details
3. Wait for scan to complete

### Step 2: Export Data
1. Click "🤖 Download Data (JSON)" button
2. Save the JSON file

### Step 3: Generate AI Report
1. Open Claude.ai (free) or ChatGPT (Plus recommended)
2. Copy the prompt above
3. Paste it into the AI tool
4. Then paste your JSON data where it says [PASTE YOUR JSON EXPORT HERE]
5. Send

### Step 4: Refine
1. Review the generated report
2. Ask the AI to adjust tone, add details, or reorganize
3. Example: "Make the executive summary more concise"
4. Example: "Add more detail to the WordPress finding"

### Step 5: Format & Deliver
1. Copy the final report
2. Paste into Word or Google Docs
3. Add your branding/logo
4. Export to PDF
5. Send to prospect

---

## Pro Tips

### For Claude.ai (Recommended)
- Use Claude 3.5 Sonnet (free tier: ~30 reports/day)
- Create a "Project" called "Security Reports" and save the prompt there
- Each report takes 30-60 seconds to generate
- Pro tier ($20/mo): Unlimited reports

### For ChatGPT
- Use GPT-4 (requires Plus subscription $20/mo)
- Save prompt as a Custom GPT for reuse
- Similar quality to Claude

### Prompt Refinement
After generating a few reports, customize the prompt:
- Add your company's specific service offerings
- Adjust tone for your brand voice
- Add industry-specific guidance
- Include your typical pricing ranges

### Save Time
- Create a Claude Project with your custom prompt
- Just paste new JSON each time
- Ask for specific adjustments: "Make this more technical" or "Simplify for a small business owner"

---

## Cost Comparison

**Free Tier** (Claude.ai or Bing Chat):
- ~30 AI-enhanced reports/day
- Perfect for testing and small volume

**Paid Tier** ($20/mo):
- Unlimited AI-enhanced reports
- Claude Pro or ChatGPT Plus
- Still cheaper than API integration

**API Integration** ($0.10-0.15/report):
- Only makes sense at 150+ reports/month
- Requires development time to build
- Less flexible once built

---

## Example Workflow

**Monday AM**: Cold outreach campaign
- Run 20 scans
- Download 20 standard .docx reports
- Email them as "free security reviews"

**Wednesday PM**: 3 prospects respond interested
- Open their JSON exports
- Generate 3 AI-enhanced reports in Claude.ai
- Light editing for personalization
- Send as professional proposals

**Cost**: $0 (using free tier) or $20/mo (Pro tier for unlimited)

**vs building API integration**:
- Development: 8+ hours
- API costs: $0.10 × 20 scans/week × 52 weeks = $104/year
- Less flexible, harder to iterate

---

## Next Steps

1. ✅ JSON export button is being deployed now
2. Test the prompt with your Cetsat.com scan
3. Refine the prompt based on results
4. Train your sales team on the two-stage workflow
5. Iterate on what works

Later, if you're doing 500+ reports/month, we can automate the AI generation. But for now, this hybrid approach gives you:
- Zero API costs
- Maximum flexibility
- Fast iteration
- Control over quality
