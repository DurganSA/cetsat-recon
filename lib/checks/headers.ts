import { CheckResult } from "../types";

export async function checkHeaders(domain: string): Promise<CheckResult> {
  try {
    const url = `https://${domain}`;
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow"
    });

    const headers = Object.fromEntries(response.headers.entries());

    const securityHeaders = {
      "strict-transport-security": headers["strict-transport-security"] || null,
      "content-security-policy": headers["content-security-policy"] || null,
      "x-frame-options": headers["x-frame-options"] || null,
      "x-content-type-options": headers["x-content-type-options"] || null,
      "referrer-policy": headers["referrer-policy"] || null,
      "permissions-policy": headers["permissions-policy"] || null
    };

    const score = calculateSecurityScore(securityHeaders);
    const grade = scoreToGrade(score);

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (grade === "F" || grade === "E") {
      status = "action";
      capability = "managed_security";
    } else if (grade === "D" || grade === "C") {
      status = "review";
      capability = "managed_security";
    }

    return {
      id: "headers",
      label: "Website security headers",
      status,
      data: {
        headers: securityHeaders,
        score,
        grade
      },
      summary: `Security headers grade: ${grade}. ${getMissingHeadersSummary(securityHeaders)}.`,
      capability
    };
  } catch (error) {
    return {
      id: "headers",
      label: "Website security headers",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check security headers."
    };
  }
}

function calculateSecurityScore(headers: Record<string, string | null>): number {
  let score = 0;
  const weights = {
    "strict-transport-security": 20,
    "content-security-policy": 25,
    "x-frame-options": 15,
    "x-content-type-options": 15,
    "referrer-policy": 15,
    "permissions-policy": 10
  };

  for (const [header, weight] of Object.entries(weights)) {
    if (headers[header]) {
      score += weight;
    }
  }

  return score;
}

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  if (score >= 20) return "E";
  return "F";
}

function getMissingHeadersSummary(headers: Record<string, string | null>): string {
  const missing = Object.entries(headers)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length === 0) return "All key headers present";
  if (missing.length <= 2) return `Missing: ${missing.join(", ")}`;
  return `${missing.length} key headers missing`;
}
