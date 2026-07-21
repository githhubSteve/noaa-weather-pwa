import { zipToLatLon } from "./geocode.js";

const STORAGE_KEY = "nwpwa.location";

function getSavedLocation() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveLocation(loc) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
}

// v1 uses ZIP as the single source of truth for location: pollen.com is
// ZIP-keyed with no lat/lon option, so every location needs a ZIP anyway.
// Geocoding that ZIP also gives us lat/lon for the NWS grid lookup, which
// avoids a second permission-gated geolocation flow entirely.
async function resolveLocationFromZip(zip) {
  const { lat, lon, cityState } = await zipToLatLon(zip);
  const loc = { zip, lat, lon, cityState };
  saveLocation(loc);
  return loc;
}

export { getSavedLocation, saveLocation, resolveLocationFromZip };
