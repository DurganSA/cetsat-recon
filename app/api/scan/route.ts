import { NextRequest } from "next/server";
import { CHECKS, runCheck } from "@/lib/checks";
import { buildComparison } from "@/lib/comparison";
import { ScanInput, CheckResult, DomainScan, DomainRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, companyName, companiesHouseNumber, recipientName, preparedBy, competitor1, competitor2 } = body;

    if (!domain) {
      return new Response(
        JSON.stringify({ error: "Domain is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const normalizedDomain = normalizeDomain(domain);

    if (!isValidDomain(normalizedDomain)) {
      return new Response(
        JSON.stringify({ error: "Invalid domain format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const input: ScanInput = {
      domain: normalizedDomain,
      companyName,
      companiesHouseNumber,
      recipientName,
      preparedBy
    };

    // Competitor domains only get the fast, competitor-eligible check subset
    // (skips SSL Labs, Shodan, lookalike, Companies House - see lib/checks/index.ts)
    const competitorDomains: { role: DomainRole; domain: string }[] = [];
    for (const [role, raw] of [["competitor1", competitor1], ["competitor2", competitor2]] as const) {
      if (!raw) continue;
      const normalized = normalizeDomain(raw);
      if (isValidDomain(normalized)) {
        competitorDomains.push({ role, domain: normalized });
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const primaryResults: CheckResult[] = [];
        const primaryPromises = CHECKS.map(async (check) => {
          const result = await runCheck(check, input);
          primaryResults.push(result);
          const line = JSON.stringify({ ...result, domain: normalizedDomain, role: "primary" as DomainRole }) + "\n";
          controller.enqueue(encoder.encode(line));
        });

        const competitorEligibleChecks = CHECKS.filter(c => c.competitorEligible);
        const competitorScans: DomainScan[] = competitorDomains.map(c => ({ role: c.role, domain: c.domain, results: [] }));

        const competitorPromises = competitorScans.flatMap((scan) => {
          const compInput: ScanInput = { domain: scan.domain };
          return competitorEligibleChecks.map(async (check) => {
            const result = await runCheck(check, compInput);
            scan.results.push(result);
            const line = JSON.stringify({ ...result, domain: scan.domain, role: scan.role }) + "\n";
            controller.enqueue(encoder.encode(line));
          });
        });

        await Promise.all([...primaryPromises, ...competitorPromises]);

        if (competitorScans.length > 0) {
          const allScans: DomainScan[] = [
            { role: "primary", domain: normalizedDomain, results: primaryResults },
            ...competitorScans
          ];
          const comparison = buildComparison(allScans);
          const comparisonLine = JSON.stringify({ type: "comparison", comparison }) + "\n";
          controller.enqueue(encoder.encode(comparisonLine));
        }

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim();
  
  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/^www\./, "");
  normalized = normalized.split("/")[0];
  
  return normalized;
}

function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-z0-9.-]+\.[a-z]{2,}$/;
  return domainRegex.test(domain);
}
