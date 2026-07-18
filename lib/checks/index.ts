import { CheckResult, ScanInput } from "../types";
import { checkDNS } from "./dns";
import { checkEmail } from "./email";
import { checkHeaders } from "./headers";
import { checkTLS } from "./tls";
import { checkSubdomains } from "./subdomains";
import { checkExposure } from "./exposure";
import { checkPageSpeed } from "./pagespeed";
import { checkWhois } from "./whois";
import { checkCompaniesHouse } from "./companies-house";
import { checkLookalike } from "./lookalike";
import { checkFingerprint } from "./fingerprint";
import { checkEmailExtras } from "./email-extras";
import { checkBlocklist } from "./blocklist";
import { checkWebHygiene } from "./web-hygiene";
import { checkSafeBrowsing } from "./safebrowsing";
import { checkGEO } from "./geo";

export type CheckFunction = (input: ScanInput) => Promise<CheckResult>;

export const CHECKS: Array<{
  id: string;
  label: string;
  fn: CheckFunction;
  priority: number;
  // Whether this check should also run against competitor domains.
  // Excludes checks that are slow (SSL Labs), quota-limited (Shodan), or
  // only meaningful for the primary domain (lookalike, Companies House).
  competitorEligible?: boolean;
}> = [
  {
    id: "lookalike",
    label: "Lookalike domains",
    fn: async (input) => checkLookalike(input.domain),
    priority: 1,
    competitorEligible: false
  },
  {
    id: "email",
    label: "Email security",
    fn: async (input) => checkEmail(input.domain),
    priority: 2,
    competitorEligible: true
  },
  {
    id: "headers",
    label: "Security headers",
    fn: async (input) => checkHeaders(input.domain),
    priority: 3,
    competitorEligible: true
  },
  {
    id: "tls",
    label: "TLS certificate",
    fn: async (input) => checkTLS(input.domain),
    priority: 4,
    competitorEligible: false
  },
  {
    id: "exposure",
    label: "Internet exposure",
    fn: async (input) => checkExposure(input.domain),
    priority: 5,
    competitorEligible: false
  },
  {
    id: "subdomains",
    label: "Subdomains",
    fn: async (input) => checkSubdomains(input.domain),
    priority: 6,
    competitorEligible: true
  },
  {
    id: "fingerprint",
    label: "Technology fingerprint",
    fn: async (input) => checkFingerprint(input.domain),
    priority: 7,
    competitorEligible: true
  },
  {
    id: "email_extras",
    label: "Email extras",
    fn: async (input) => checkEmailExtras(input.domain),
    priority: 8,
    competitorEligible: true
  },
  {
    id: "blocklist",
    label: "Email blocklists",
    fn: async (input) => checkBlocklist(input.domain),
    priority: 9,
    competitorEligible: true
  },
  {
    id: "web_hygiene",
    label: "Web hygiene",
    fn: async (input) => checkWebHygiene(input.domain),
    priority: 10,
    competitorEligible: true
  },
  {
    id: "safebrowsing",
    label: "Safe Browsing",
    fn: async (input) => checkSafeBrowsing(input.domain),
    priority: 11,
    competitorEligible: true
  },
  {
    id: "geo",
    label: "AI Discoverability / GEO",
    fn: async (input) => checkGEO(input.domain),
    priority: 12,
    competitorEligible: true
  },
  {
    id: "pagespeed",
    label: "Page speed",
    fn: async (input) => checkPageSpeed(input.domain),
    priority: 13,
    competitorEligible: true
  },
  {
    id: "dns",
    label: "DNS",
    fn: async (input) => checkDNS(input.domain),
    priority: 14,
    competitorEligible: true
  },
  {
    id: "whois",
    label: "Domain registration",
    fn: async (input) => checkWhois(input.domain),
    priority: 15,
    competitorEligible: true
  },
  {
    id: "companies_house",
    label: "Companies House",
    fn: async (input) => checkCompaniesHouse(input.domain, input.companyName, input.companiesHouseNumber),
    priority: 16,
    competitorEligible: false
  }
];

export async function runCheck(check: typeof CHECKS[0], input: ScanInput): Promise<CheckResult> {
  try {
    return await check.fn(input);
  } catch (error) {
    return {
      id: check.id,
      label: check.label,
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: `Check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
