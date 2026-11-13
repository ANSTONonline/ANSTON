import { citiesOf, isCountry, regionsOf } from "@/lib/places";

// Location choices for the listing form.
// GET /api/places?country=US            -> states/regions of the country
// GET /api/places?country=US&region=TX  -> city names in that region
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const country = (params.get("country") ?? "").toUpperCase();
  const region = params.get("region") ?? "";
  if (!isCountry(country)) return Response.json([], { status: 400 });
  const data = region ? citiesOf(country, region) : regionsOf(country);
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=86400" } });
}
