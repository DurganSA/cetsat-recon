# Deployment Guide

## Local Development

```bash
npm install
cp .env.example .env.local
# Add your API keys to .env.local
npm run dev
```

Visit http://localhost:3000

## Vercel Deployment

### Prerequisites
- GitHub repository
- Vercel account
- **Vercel Pro plan** (required for 300-second function timeout)

### Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Cetsat Recon"
   git branch -M main
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Framework preset: Next.js (auto-detected)

3. **Configure Environment Variables**
   In Vercel project settings, add:
   - `COMPANIES_HOUSE_API_KEY` (get from https://developer.company-information.service.gov.uk/)
   - `PAGESPEED_API_KEY` (optional, get from Google Cloud Console)
   - `SAFEBROWSING_API_KEY` (optional, get from Google Cloud Console)

4. **Enable Fluid Compute**
   - Go to Project Settings → Fluid Compute
   - Enable Fluid for the `/api/scan` route
   - This allows the 300-second timeout needed for SSL Labs

5. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete
   - Visit your production URL

### Fluid Compute Requirement

The `/api/scan` route is configured for a 300-second timeout to accommodate the slow SSL Labs check. This requires:
- Vercel Pro plan ($20/month)
- Fluid Compute enabled

Without Fluid Compute, the scan will timeout after 10 seconds on Hobby plan.

## Environment Variables Reference

### COMPANIES_HOUSE_API_KEY
- **Required for**: Companies House data lookup
- **Get it**: https://developer.company-information.service.gov.uk/
- **Free**: Yes
- **Rate limits**: 600 requests per 5 minutes

### PAGESPEED_API_KEY
- **Required for**: Google PageSpeed Insights
- **Get it**: https://developers.google.com/speed/docs/insights/v5/get-started
- **Free**: Yes, with limits
- **Optional**: Works without key but has lower rate limits

### SAFEBROWSING_API_KEY
- **Required for**: Google Safe Browsing check
- **Get it**: https://developers.google.com/safe-browsing/v4/get-started
- **Free**: Yes, up to 10,000 queries/day
- **Optional**: Check is skipped if key not present

## Post-Deployment Checklist

- [ ] Test a scan with a known domain (e.g., example.com)
- [ ] Verify all checks complete successfully
- [ ] Download and review a generated report
- [ ] Check that SSL Labs scan completes (takes 1-2 minutes)
- [ ] Confirm lookalike domain check works
- [ ] Test with a UK company domain if Companies House key is configured

## Monitoring

Monitor your Vercel deployment:
- Function execution time (should complete within 300s)
- Error rates
- API usage (Companies House, PageSpeed, Safe Browsing)

## Troubleshooting

### Scan times out
- Ensure Fluid Compute is enabled
- Verify Pro plan is active
- Check that `vercel.json` has correct maxDuration

### Companies House returns "API key not configured"
- Verify environment variable is set in Vercel
- Redeploy after adding the variable

### SSL Labs always shows "in progress"
- SSL Labs caches results for 24 hours
- Use `fromCache=on` parameter (already configured)
- First scan of a domain takes 1-2 minutes

### Report download fails
- Check browser console for errors
- Verify `/api/report` route is working
- Ensure docx library installed correctly

## Security Notes

1. **API Keys**: All API keys should be stored as environment variables, never committed to git
2. **Rate Limiting**: Consider adding rate limiting to prevent abuse
3. **Input Validation**: Domain validation is in place, but consider additional sanitization for production
4. **CORS**: Configure CORS if you need to call the API from other domains

## Cost Estimates

- **Vercel Pro**: $20/month
- **Companies House API**: Free
- **PageSpeed API**: Free up to 25,000 queries/day
- **Safe Browsing API**: Free up to 10,000 queries/day

For moderate usage (50 scans/day), total cost is ~$20/month.
