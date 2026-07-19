import { CheckResult } from "../types";
import { SIC_CODE_DESCRIPTIONS } from "../sic-codes";

// Companies House "last_accounts.type" values, mapped to a plain-English size proxy.
// A legitimate, free way to say "a small firm" or "a mid-sized business" honestly,
// without guessing headcount from LinkedIn.
const ACCOUNTS_CATEGORY_LABELS: Record<string, string> = {
  "micro-entity": "Micro entity",
  small: "Small company",
  medium: "Medium-sized company",
  full: "Full accounts (larger company)",
  group: "Group accounts (parent of a corporate group)",
  dormant: "Dormant company",
  interim: "Interim accounts",
  initial: "Initial accounts",
  "unaudited-abridged": "Small company (unaudited abridged accounts)",
  "audited-abridged": "Small company (audited abridged accounts)",
  "total-exemption-full": "Small company (full exemption)",
  "total-exemption-small": "Small company (exemption)",
  "partial-exemption": "Small company (partial exemption)",
  "no-accounts-filed": "No accounts filed yet"
};

function calculateYearsSince(dateString: string | undefined | null): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365));
}

export async function checkCompaniesHouse(
  domain: string,
  companyName?: string,
  companiesHouseNumber?: string
): Promise<CheckResult> {
  try {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

    if (!apiKey) {
      return {
        id: "companies_house",
        label: "Companies House",
        status: "info",
        data: { error: "API key not configured" },
        summary: "Companies House API key not configured."
      };
    }

    let companyNumber = companiesHouseNumber;

    if (!companyNumber && companyName) {
      const searchUrl = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(companyName)}`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`
        }
      });

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error("Companies House search failed:", searchResponse.status, errorText);
        return {
          id: "companies_house",
          label: "Companies House",
          status: "info",
          data: { error: `Search failed with status ${searchResponse.status}`, searchQuery: companyName },
          summary: `Companies House search failed. Status: ${searchResponse.status}`
        };
      }

      const searchData = await searchResponse.json();
      console.log("Companies House search results:", searchData.items?.length || 0, "results for", companyName);
      
      if (searchData.items && searchData.items.length > 0) {
        companyNumber = searchData.items[0].company_number;
        console.log("Selected company:", searchData.items[0].title, "Number:", companyNumber);
      } else {
        return {
          id: "companies_house",
          label: "Companies House",
          status: "info",
          data: { searchQuery: companyName, resultsCount: 0 },
          summary: `No Companies House match found for "${companyName}". Try using the company number instead.`
        };
      }
    }

    if (!companyNumber) {
      return {
        id: "companies_house",
        label: "Companies House",
        status: "info",
        data: {},
        summary: "No company name or number provided."
      };
    }

    const companyUrl = `https://api.company-information.service.gov.uk/company/${companyNumber}`;
    const companyResponse = await fetch(companyUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`
      }
    });

    if (!companyResponse.ok) {
      throw new Error("Companies House API query failed");
    }

    const companyData = await companyResponse.json();

    const officersUrl = `https://api.company-information.service.gov.uk/company/${companyNumber}/officers`;
    const officersResponse = await fetch(officersUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`
      }
    });

    const officersData = officersResponse.ok ? await officersResponse.json() : null;

    const officers = officersData?.items?.map((o: any) => ({
      name: o.name,
      role: o.officer_role,
      appointedOn: o.appointed_on,
      resignedOn: o.resigned_on || null
    })) || [];

    // "director" (human) is a distinct officer_role from "corporate-director" and
    // "secretary" in the Companies House schema, so filtering on the exact string
    // already excludes corporate entities and secretaries without extra logic.
    const activeDirectors = officers.filter((o: any) => o.role === "director" && !o.resignedOn);
    const activeDirectorCount = activeDirectors.length;
    const directorTenures = activeDirectors
      .map((o: any) => calculateYearsSince(o.appointedOn))
      .filter((years: number | null): years is number => years !== null);
    const longestServingDirectorTenureYears = directorTenures.length > 0 ? Math.max(...directorTenures) : null;

    const companyAge = calculateYearsSince(companyData.date_of_creation);

    const accountsType = companyData.accounts?.last_accounts?.type || null;
    const accountsCategory = accountsType
      ? (ACCOUNTS_CATEGORY_LABELS[accountsType] || accountsType)
      : null;

    const sicCodes = companyData.sic_codes || [];
    const sicCodeDescriptions = sicCodes.map((code: string) => ({
      code,
      description: SIC_CODE_DESCRIPTIONS[code] || `SIC ${code}`
    }));

    const summaryParts = [
      `${companyData.company_name} (${companyData.company_number}), ${companyData.company_status}, incorporated ${companyData.date_of_creation}`
    ];
    if (companyAge !== null) summaryParts.push(`trading ${companyAge} year(s)`);
    if (accountsCategory) summaryParts.push(accountsCategory);
    if (activeDirectorCount > 0) summaryParts.push(`${activeDirectorCount} active director(s)`);

    return {
      id: "companies_house",
      label: "Companies House",
      status: "info",
      data: {
        companyNumber: companyData.company_number,
        companyName: companyData.company_name,
        status: companyData.company_status,
        type: companyData.type,
        sicCodes,
        sicCodeDescriptions,
        dateOfCreation: companyData.date_of_creation,
        companyAge,
        accountsCategory,
        activeDirectorCount,
        longestServingDirectorTenureYears,
        officers
      },
      summary: summaryParts.join(", ") + "."
    };
  } catch (error) {
    return {
      id: "companies_house",
      label: "Companies House",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not retrieve Companies House data."
    };
  }
}
