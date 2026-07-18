import { CheckResult } from "../types";

export async function checkWhois(domain: string): Promise<CheckResult> {
  try {
    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("RDAP query failed");
    }

    const data = await response.json();

    const events = data.events || [];
    const registrationEvent = events.find((e: any) => e.eventAction === "registration");
    const registrationDate = registrationEvent ? new Date(registrationEvent.eventDate) : null;
    const domainAge = registrationDate
      ? Math.floor((Date.now() - registrationDate.getTime()) / (1000 * 60 * 60 * 24 * 365))
      : null;

    const registrar = data.entities?.find((e: any) => e.roles?.includes("registrar"))?.vcardArray?.[1]?.find(
      (v: any) => v[0] === "fn"
    )?.[3] || "Unknown";

    return {
      id: "whois",
      label: "Domain age / registrar",
      status: "info",
      data: {
        registrationDate: registrationDate?.toISOString(),
        domainAge,
        registrar
      },
      summary: `Registered ${domainAge ? `${domainAge} years ago` : "date unknown"} via ${registrar}.`
    };
  } catch (error) {
    return {
      id: "whois",
      label: "Domain age / registrar",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not retrieve domain registration information."
    };
  }
}
