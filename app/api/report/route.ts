import { NextRequest } from "next/server";
import { generateReport } from "@/lib/report";
import { CheckResult, ComparisonResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { results, input, competitors, comparison } = body;

    if (!results || !Array.isArray(results) || !input || !input.domain) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const reportBuffer = await generateReport(
      results as CheckResult[],
      input,
      Array.isArray(competitors) ? competitors : [],
      (comparison as ComparisonResult) ?? null
    );

    const filename = `security-review-${input.domain}-${new Date().toISOString().split("T")[0]}.docx`;

    return new Response(new Uint8Array(reportBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": reportBuffer.length.toString()
      }
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
