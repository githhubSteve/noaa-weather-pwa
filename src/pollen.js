// pollen.com has no CORS headers, so this goes through a small Cloudflare Worker
// proxy that just re-forwards the request and adds Access-Control-Allow-Origin.
const PROXY_BASE = "https://noaa-weather-pollen-proxy.fancy-meadow-47bd.workers.dev";

// pollen.com only exposes one overall index, no separate tree/grass/weed
// scores (checked -- every paid provider that has those, Ambee/Tomorrow.io/
// Google, wants $100+/mo). But each currently-active plant in `Triggers` is
// already tagged with a PlantType (Grass, Ragweed, presumably Tree), so we
// can at least group today's triggers by that category for free instead of
// showing them as one flat list.
const CATEGORY_ORDER = ["Tree", "Grass", "Ragweed", "Weed"];

function groupTriggersByType(triggers) {
  const byType = new Map();
  triggers.forEach(({ Name, PlantType }) => {
    const type = PlantType || "Other";
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(Name);
  });

  return [...byType.entries()]
    .sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .map(([type, names]) => ({ type, names }));
}

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
    triggersByType: groupTriggersByType(today.Triggers),
    displayLocation: data.Location.DisplayLocation,
  };
}

export { fetchPollen };
