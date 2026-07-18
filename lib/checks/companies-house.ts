import { CheckResult } from "../types";

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

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        companyNumber = searchData.items?.[0]?.company_number;
      }
    }

    if (!companyNumber) {
      return {
        id: "companies_house",
        label: "Companies House",
        status: "info",
        data: {},
        summary: "No Companies House match found."
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

    return {
      id: "companies_house",
      label: "Companies House",
      status: "info",
      data: {
        companyNumber: companyData.company_number,
        companyName: companyData.company_name,
        status: companyData.company_status,
        type: companyData.type,
        sicCodes: companyData.sic_codes,
        dateOfCreation: companyData.date_of_creation,
        officers: officersData?.items?.map((o: any) => ({
          name: o.name,
          role: o.officer_role,
          appointedOn: o.appointed_on
        })) || []
      },
      summary: `${companyData.company_name} (${companyData.company_number}), ${companyData.company_status}, incorporated ${companyData.date_of_creation}.`
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
