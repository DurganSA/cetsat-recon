# Cetsat Recon

A prospect security review web application that performs passive, public-source-only security checks on domains.

## Features

- **15+ Security Checks**: DNS, email security (SPF/DKIM/DMARC), TLS, security headers, lookalike domains, technology fingerprinting, and more
- **Streaming Results**: NDJSON streaming for instant feedback as checks complete
- **Professional Reports**: Generate branded Word (.docx) reports with findings and recommendations
- **Capability Mapping**: Automatically maps findings to Cetsat service offerings
- **100% Passive**: No active scanning, port scanning, or intrusive testing

## Architecture

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Streaming API** for real-time results
- **Word document generation** with docx library

## Checks Performed

### Core Checks
- DNS & DNSSEC configuration
- Email security (SPF, DKIM, DMARC)
- Security headers grading
- TLS/SSL certificate analysis (via SSL Labs)
- Subdomain discovery (via certificate transparency logs)
- Internet exposure scanning (via Shodan InternetDB)
- Page speed & SEO metrics (via Google Lighthouse)
- Domain age & registrar info (via RDAP)
- Companies House data (UK companies)

### Advanced Checks
- **Lookalike domains** - Detects registered typosquatting domains
- **Technology fingerprinting** - CMS and framework detection
- **Email hygiene extras** - MTA-STS, TLS-RPT, BIMI, SPF validation
- **Blocklist checking** - DNSBL reputation checks
- **Web hygiene** - HTTPS enforcement, cookie consent compliance
- **Safe Browsing** - Google Safe Browsing API integration

## Installation

```bash
# Clone or extract the project
cd cetsat-recon

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Run development server
npm run dev
```

Visit http://localhost:3000

## Environment Variables

```bash
# Required for Companies House data
COMPANIES_HOUSE_API_KEY=your_key_here

# Optional, improves rate limits
PAGESPEED_API_KEY=your_key_here

# Optional, for Safe Browsing checks
SAFEBROWSING_API_KEY=your_key_here
```

### API Keys

- **Companies House**: Free at https://developer.company-information.service.gov.uk/
- **PageSpeed**: Free at https://developers.google.com/speed/docs/insights/v5/get-started
- **Safe Browsing**: Free at https://developers.google.com/safe-browsing/v4/get-started

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. **Use Pro plan with Fluid compute** (required for 300s scan timeout)
5. Deploy

The `/api/scan` route is configured for 300 seconds to accommodate the slow SSL Labs check.

## Project Structure

```
cetsat-recon/
├── app/
│   ├── page.tsx              # Main UI (form + results)
│   ├── layout.tsx
│   └── api/
│       ├── scan/route.ts     # NDJSON streaming endpoint
│       └── report/route.ts   # .docx generation endpoint
├── lib/
│   ├── types.ts              # TypeScript types
│   ├── capabilities.ts       # Service catalogue
│   ├── report.ts             # Word document generator
│   └── checks/
│       ├── index.ts          # Check registry
│       ├── dns.ts
│       ├── email.ts
│       ├── headers.ts
│       ├── tls.ts
│       ├── subdomains.ts
│       ├── exposure.ts
│       ├── pagespeed.ts
│       ├── whois.ts
│       ├── companies-house.ts
│       ├── lookalike.ts      # NEW
│       ├── fingerprint.ts    # NEW
│       ├── email-extras.ts   # NEW
│       ├── blocklist.ts      # NEW
│       ├── web-hygiene.ts    # NEW
│       └── safebrowsing.ts   # NEW
└── vercel.json               # Vercel configuration
```

## Usage

1. Enter a domain (e.g., `example.com`)
2. Optionally add company details for enhanced reports
3. Click "Run Scan"
4. Watch results stream in real-time
5. Download the Word report when complete

## Key Principles

1. **Passive only**: Every check reads public indexes or the target's own public responses
2. **No active scanning**: No port scanning, no probe requests, no testing attack surfaces
3. **Capability-driven opportunities**: Service recommendations only appear if a finding triggers them
4. **UK compliance focus**: GDPR, PECR, Companies House integration

## Guardrails

- Never probe paths like `/wp-admin` or `/backup.zip`
- Never submit crafted input to test vulnerabilities
- Never port scan or test services
- Confirm pricing and facts before sending reports to prospects
- Results cache during development to avoid API rate limits

## Adding New Checks

1. Create a new file in `lib/checks/`
2. Export an async function that returns a `CheckResult`
3. Add the check to the registry in `lib/checks/index.ts`
4. Optionally map to a capability in the check's output

## License

Internal use for Cetsat prospect outreach.

## Support

For issues or questions, contact the development team.
