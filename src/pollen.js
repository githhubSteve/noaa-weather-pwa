// Google Pollen API requires an API key, which must never be shipped to the
// browser (anyone could read it from page source and run up billable calls
// against the account). This goes through a Cloudflare Worker that holds the
// key server-side and re-forwards the request, adding CORS back on the way
// out (Google's API isn't meant to be called with a bare key from client JS).
const PROXY_BASE = "https://noaa-weather-pollen-proxy.fancy-meadow-47bd.workers.dev";

const CATEGORY_ORDER = ["TREE", "GRASS", "WEED"];

async function fetchPollen(lat, lon) {
  const res = await fetch(`${PROXY_BASE}/pollen/${lat}/${lon}`);
  if (!res.ok) {
    throw new Error(`Pollen request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const today = data.dailyInfo?.[0];
  if (!today) {
    throw new Error("No pollen forecast data for this location");
  }

  const categories = (today.pollenTypeInfo || [])
    .slice()
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.code) - CATEGORY_ORDER.indexOf(b.code))
    .map((pt) => ({
      type: pt.code, // "TREE" | "GRASS" | "WEED"
      displayName: pt.displayName,
      value: pt.indexInfo?.value ?? null,
      category: pt.indexInfo?.category ?? null,
      inSeason: pt.inSeason,
    }));

  const inSeasonPlants = (today.plantInfo || [])
    .filter((p) => p.inSeason)
    .map((p) => ({ name: p.displayName, type: p.plantDescription?.type }));

  return { categories, inSeasonPlants };
}

export { fetchPollen };
