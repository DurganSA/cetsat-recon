# API Keys Setup Guide

## Quick Links

### 1. PageSpeed Insights API (Google Cloud)
**Enable API**: https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com
**Create Credentials**: https://console.cloud.google.com/apis/credentials

**Steps**:
1. Click "Enable" on the API page
2. Go to Credentials → "+ CREATE CREDENTIALS" → "API key"
3. Copy the key
4. Restrict to "PageSpeed Insights API" only
5. Add to `.env.local` as `PAGESPEED_API_KEY=your_key_here`

**Rate Limits**:
- Without key: 25 requests/day
- With key: 25,000 requests/day
- Cost: Free

---

### 2. Companies House API (UK Government)
**Register**: https://developer.company-information.service.gov.uk/
**Get API Key**: https://developer.company-information.service.gov.uk/api-key-request

**Steps**:
1. Create an account
2. Request an API key (instant approval)
3. Copy the key
4. Add to `.env.local` as `COMPANIES_HOUSE_API_KEY=your_key_here`

**Rate Limits**:
- 600 requests per 5 minutes
- Cost: Free

---

### 3. Safe Browsing API (Google Cloud)
**Enable API**: https://console.cloud.google.com/apis/library/safebrowsing.googleapis.com
**Create Credentials**: https://console.cloud.google.com/apis/credentials

**Steps**:
1. Click "Enable" on the API page
2. Go to Credentials → "+ CREATE CREDENTIALS" → "API key"
3. Copy the key
4. Restrict to "Safe Browsing API" only
5. Add to `.env.local` as `SAFEBROWSING_API_KEY=your_key_here`

**Rate Limits**:
- 10,000 queries/day
- Cost: Free

---

## .env.local Template

```bash
# Companies House API Key (required for UK company data)
COMPANIES_HOUSE_API_KEY=your_companies_house_key_here

# Google PageSpeed API Key (optional but recommended)
PAGESPEED_API_KEY=your_pagespeed_key_here

# Google Safe Browsing API Key (optional)
SAFEBROWSING_API_KEY=your_safebrowsing_key_here
```

---

## Testing Locally

After adding keys to `.env.local`:

```bash
cd C:\sites\saleschecker\cetsat-recon
npm run dev
```

Visit http://localhost:3000 and run a scan to verify all checks work.

---

## Adding to Vercel

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add each key:
   - Name: `COMPANIES_HOUSE_API_KEY` → Value: your key
   - Name: `PAGESPEED_API_KEY` → Value: your key
   - Name: `SAFEBROWSING_API_KEY` → Value: your key
4. Redeploy the project

---

## Troubleshooting

### PageSpeed API returns 403 error
- Ensure the API is enabled in Google Cloud Console
- Check that the API key has "PageSpeed Insights API" in its restrictions
- Wait 5 minutes after creating the key for it to propagate

### Companies House returns "Unauthorized"
- Verify the API key is correct (no extra spaces)
- Check you're using the key from developer.company-information.service.gov.uk
- The key format looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### Safe Browsing not working
- Ensure "Safe Browsing API" is enabled in Google Cloud
- Check the API key restrictions include the Safe Browsing API
- Verify you're within the 10,000 daily query limit

---

## Which APIs are Required?

| API | Required? | Purpose | Works without? |
|-----|-----------|---------|----------------|
| Companies House | No | UK company data lookup | Yes, check is skipped |
| PageSpeed | No | Performance/SEO scores | Yes, but with lower rate limits |
| Safe Browsing | No | Malware/phishing detection | Yes, check is skipped |

**All APIs are optional** - the app will work without them, but some checks will be skipped or limited.
