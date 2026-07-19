import { CheckResult } from "../types";

// Optional - buys the one genuine compliment a report can lead with. If there's no API
// key, no matching listing, or no rating data, this emits available:false so the
// enrichment LLM knows to omit the compliment rather than invent one.
const FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function findPlaceId(companyName: string, domain: string, apiKey: string): Promise<string | null> {
  const query = `${companyName} ${domain}`;
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${apiKey}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Places findplace failed (${response.status})`);

  const data = await response.json();
  if (data.status !== "OK" || !data.candidates?.length) return null;
  return data.candidates[0].place_id;
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<{
  rating?: number;
  totalRatings?: number;
  reviewSnippet?: string;
} | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total,reviews&key=${apiKey}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Places details failed (${response.status})`);

  const data = await response.json();
  if (data.status !== "OK") return null;

  const result = data.result || {};
  const reviews: any[] = result.reviews || [];
  // Prefer a genuinely positive, substantive review over the first one returned.
  const bestReview = reviews
    .filter(r => r.rating >= 4 && r.text)
    .sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0))[0];

  return {
    rating: result.rating,
    totalRatings: result.user_ratings_total,
    reviewSnippet: bestReview?.text ? bestReview.text.slice(0, 300) : undefined
  };
}

export async function checkReputation(domain: string, companyName?: string): Promise<CheckResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return {
      id: "reputation",
      label: "Reputation signal",
      status: "info",
      data: { available: false, reason: "Google Places API key not configured" },
      summary: "Reputation signal unavailable - omit the compliment rather than invent one."
    };
  }

  if (!companyName) {
    return {
      id: "reputation",
      label: "Reputation signal",
      status: "info",
      data: { available: false, reason: "No company name provided" },
      summary: "Reputation signal unavailable - omit the compliment rather than invent one."
    };
  }

  try {
    const placeId = await findPlaceId(companyName, domain, apiKey);
    if (!placeId) {
      return {
        id: "reputation",
        label: "Reputation signal",
        status: "info",
        data: { available: false, reason: "No matching Google Business listing found" },
        summary: "No matching Google Business listing found - omit the compliment rather than invent one."
      };
    }

    const details = await getPlaceDetails(placeId, apiKey);
    if (!details || details.rating == null) {
      return {
        id: "reputation",
        label: "Reputation signal",
        status: "info",
        data: { available: false, reason: "No rating data available" },
        summary: "No rating data available - omit the compliment rather than invent one."
      };
    }

    return {
      id: "reputation",
      label: "Reputation signal",
      status: "info",
      data: {
        available: true,
        rating: details.rating,
        totalRatings: details.totalRatings,
        reviewSnippet: details.reviewSnippet
      },
      summary: `Google rating: ${details.rating}/5${details.totalRatings ? ` (${details.totalRatings} reviews)` : ""}.`
    };
  } catch (error) {
    return {
      id: "reputation",
      label: "Reputation signal",
      status: "info",
      data: { available: false, reason: error instanceof Error ? error.message : String(error) },
      summary: "Could not retrieve reputation signal - omit the compliment rather than invent one."
    };
  }
}
