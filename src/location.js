import { zipToLatLon } from "./geocode.js";

const STORAGE_KEY = "nwpwa.location";

function getSavedLocation() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveLocation(loc) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
}

// ZIP is still the user-facing input (simpler than a permission-gated
// geolocation prompt); geocoding it gives us the lat/lon that both the NWS
// grid lookup and the Google Pollen API actually need.
async function resolveLocationFromZip(zip) {
  const { lat, lon, cityState } = await zipToLatLon(zip);
  const loc = { zip, lat, lon, cityState };
  saveLocation(loc);
  return loc;
}

export { getSavedLocation, saveLocation, resolveLocationFromZip };
