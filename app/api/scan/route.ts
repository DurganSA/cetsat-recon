import { NextRequest } from "next/server";
import { CHECKS, runCheck } from "@/lib/checks";
import { ScanInput, CheckResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, companyName, companiesHouseNumber, recipientName, preparedBy } = body;

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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const checkPromises = CHECKS.map(async (check) => {
          try {
            const result = await runCheck(check, input);
            const line = JSON.stringify(result) + "\n";
            controller.enqueue(encoder.encode(line));
          } catch (error) {
            const errorResult: CheckResult = {
              id: check.id,
              label: check.label,
              status: "info",
              data: { error: error instanceof Error ? error.message : String(error) },
              summary: `Check failed: ${error instanceof Error ? error.message : String(error)}`
            };
            const line = JSON.stringify(errorResult) + "\n";
            controller.enqueue(encoder.encode(line));
          }
        });

        await Promise.all(checkPromises);
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
