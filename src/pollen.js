// pollen.com has no CORS headers, so this goes through a small Cloudflare Worker
// proxy that just re-forwards the request and adds Access-Control-Allow-Origin.
const PROXY_BASE = "https://noaa-weather-pollen-proxy.fancy-meadow-47bd.workers.dev";

async function fetchPollen(zip) {
  const res = await fetch(`${PROXY_BASE}/pollen/${zip}`);
  if (!res.ok) {
    throw new Error(`Pollen request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const periods = data.Location.periods;
  const today = periods.find((p) => p.Type === "Today") || periods[0];
  return {
    index: today.Index,
    triggers: today.Triggers.map((t) => t.Name),
    displayLocation: data.Location.DisplayLocation,
  };
}

export { fetchPollen };
