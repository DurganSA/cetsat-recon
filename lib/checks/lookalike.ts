import { CheckResult } from "../types";

async function resolveA(domain: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await response.json();
    return data.Answer?.map((a: any) => a.data) || [];
  } catch {
    return [];
  }
}

async function resolveMX(domain: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await response.json();
    return data.Answer?.map((a: any) => a.data) || [];
  } catch {
    return [];
  }
}

export type LookalikeCandidate = { domain: string; hasA: boolean; hasMX: boolean; hasCert: boolean };

// Resolves which lookalike permutations of a domain are actually registered/live.
// Shared with the threat-intel check so both reuse the same permutation + resolution logic.
export async function findRegisteredLookalikes(domain: string): Promise<{ checked: number; found: LookalikeCandidate[] }> {
  const [baseDomain, tld] = splitDomain(domain);
  const permutations = generatePermutations(baseDomain, tld);

  const checks = permutations.map(async (candidate): Promise<LookalikeCandidate | null> => {
    try {
      const aRecords = await resolveA(candidate);
      const hasA = aRecords.length > 0;
      if (!hasA) return null;

      const [mxRecords, hasCert] = await Promise.all([
        resolveMX(candidate),
        checkCertificate(candidate)
      ]);

      return { domain: candidate, hasA, hasMX: mxRecords.length > 0, hasCert };
    } catch {
      return null;
    }
  });

  const found = (await Promise.all(checks)).filter((r): r is LookalikeCandidate => r !== null);
  return { checked: permutations.length, found };
}

export async function checkLookalike(domain: string): Promise<CheckResult> {
  try {
    const { checked, found: results } = await findRegisteredLookalikes(domain);

    let status: "good" | "review" | "action" = "good";
    let capability: string | undefined;

    if (results.length > 0) {
      // A cert issued to a lookalike is as strong a signal as an MX record - both indicate
      // someone is actively standing up infrastructure on it, not just squatting the name.
      status = results.some(r => r.hasMX || r.hasCert) ? "action" : "review";
      capability = "human_firewall";
    }

    return {
      id: "lookalike",
      label: "Lookalike domains",
      status,
      data: {
        checked,
        found: results
      },
      summary: results.length > 0
        ? `Found ${results.length} registered lookalike domain(s) that could be used for impersonation.`
        : `No lookalike domains detected (checked ${checked} permutations).`,
      capability
    };
  } catch (error) {
    return {
      id: "lookalike",
      label: "Lookalike domains",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not check lookalike domains."
    };
  }
}

function splitDomain(domain: string): [string, string] {
  const parts = domain.split(".");
  if (parts.length < 2) return [domain, "com"];
  const tld = parts.slice(-1)[0];
  const base = parts.slice(0, -1).join(".");
  return [base, tld];
}

function generatePermutations(baseDomain: string, tld: string): string[] {
  const permutations = new Set<string>();
  const maxPermutations = 50;

  const alternativeTlds = ["com", "co.uk", "org", "net", "io"];
  alternativeTlds.forEach(altTld => {
    if (altTld !== tld) {
      permutations.add(`${baseDomain}.${altTld}`);
    }
  });

  const adjacentKeys: Record<string, string> = {
    a: "sqw", b: "vghn", c: "xdfv", d: "sfcx", e: "rwd", f: "dgcv",
    g: "fhvb", h: "gjbn", i: "uko", j: "hknm", k: "jlmo", l: "kop",
    m: "njk", n: "bhjm", o: "ilkp", p: "ol", q: "wa", r: "etd",
    s: "awdz", t: "ryfg", u: "yij", v: "cfgb", w: "qase", x: "zsdc",
    y: "tgu", z: "asx"
  };

  for (let i = 0; i < baseDomain.length && permutations.size < maxPermutations; i++) {
    const char = baseDomain[i];
    
    if (adjacentKeys[char]) {
      for (const replacement of adjacentKeys[char]) {
        permutations.add(`${baseDomain.substring(0, i)}${replacement}${baseDomain.substring(i + 1)}.${tld}`);
      }
    }

    permutations.add(`${baseDomain.substring(0, i)}${baseDomain.substring(i + 1)}.${tld}`);

    if (i < baseDomain.length - 1) {
      const swapped = baseDomain.substring(0, i) + baseDomain[i + 1] + baseDomain[i] + baseDomain.substring(i + 2);
      permutations.add(`${swapped}.${tld}`);
    }
  }

  if (!baseDomain.includes("-") && permutations.size < maxPermutations) {
    for (let i = 1; i < baseDomain.length && permutations.size < maxPermutations; i++) {
      permutations.add(`${baseDomain.substring(0, i)}-${baseDomain.substring(i)}.${tld}`);
    }
  }

  return Array.from(permutations).slice(0, maxPermutations);
}

async function checkCertificate(domain: string): Promise<boolean> {
  try {
    const response = await fetch(`https://crt.sh/?q=${domain}&output=json`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.length > 0;
  } catch {
    return false;
  }
}
