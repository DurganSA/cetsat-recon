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
        // runCheck() already catches errors from the check itself, but a rejection
        // anywhere in this per-check wrapper (or a throw from controller.enqueue) would
        // otherwise reject the whole Promise.all below and silently truncate the stream
        // (the client just sees a shorter-than-expected response, not an error). Each
        // check is isolated here so one failure can never take out the others.
        const runIsolated = async (
          check: typeof CHECKS[0],
          checkInput: ScanInput,
          domain: string,
          role: DomainRole,
          onResult?: (result: CheckResult) => void
        ) => {
          try {
            const result = await runCheck(check, checkInput);
            onResult?.(result);
            const line = JSON.stringify({ ...result, domain, role }) + "\n";
            controller.enqueue(encoder.encode(line));
          } catch (error) {
            console.error(`[scan] check "${check.id}" failed for ${domain}:`, error);
          }
        };

        const primaryResults: CheckResult[] = [];
        const primaryPromises = CHECKS.map((check) =>
          runIsolated(check, input, normalizedDomain, "primary", (result) => primaryResults.push(result))
        );

        const competitorEligibleChecks = CHECKS.filter(c => c.competitorEligible);
        const competitorScans: DomainScan[] = competitorDomains.map(c => ({ role: c.role, domain: c.domain, results: [] }));

        const competitorPromises = competitorScans.flatMap((scan) => {
          const compInput: ScanInput = { domain: scan.domain };
          return competitorEligibleChecks.map((check) =>
            runIsolated(check, compInput, scan.domain, scan.role, (result) => scan.results.push(result))
          );
        });

        await Promise.allSettled([...primaryPromises, ...competitorPromises]);

        try {
          if (competitorScans.length > 0) {
            const allScans: DomainScan[] = [
              { role: "primary", domain: normalizedDomain, results: primaryResults },
              ...competitorScans
            ];
            const comparison = buildComparison(allScans);
            const comparisonLine = JSON.stringify({ type: "comparison", comparison }) + "\n";
            controller.enqueue(encoder.encode(comparisonLine));
          }
        } catch (error) {
          console.error("[scan] failed to build comparison:", error);
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
