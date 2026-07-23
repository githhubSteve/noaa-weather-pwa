import { fetchPointMeta, fetchGridSeries, fetchLatestObservation } from "./src/nws.js";
import { fetchPollen } from "./src/pollen.js";
import { getSavedLocation, resolveLocationFromZip } from "./src/location.js";
import { makeHourlyChart } from "./src/chart.js";

const HOURS_TO_SHOW = 168; // 7 days

const $ = (id) => document.getElementById(id);

const els = {
  locationName: $("location-name"),
  updatedAt: $("updated-at"),
  refreshBtn: $("refresh-btn"),
  changeLocationBtn: $("change-location-btn"),
  locationSetup: $("location-setup"),
  locationForm: $("location-form"),
  zipInput: $("zip-input"),
  nowDay: $("now-day"),
  nowDate: $("now-date"),
  nowTemp: $("now-temp"),
  nowConditions: $("now-conditions"),
  nowDetail: $("now-detail"),
  nowSun: $("now-sun"),
  hourlySection: $("hourly-section"),
  chartHourly: $("chart-hourly"),
  legendToggle: $("legend-toggle"),
  legendRow: $("legend-row"),
  pollenIndex: $("pollen-index"),
  pollenTriggers: $("pollen-triggers"),
  errorPanel: $("error-panel"),
};

let hourlyChart = null;

function showError(message) {
  els.errorPanel.hidden = false;
  els.errorPanel.textContent = message;
}

function clearError() {
  els.errorPanel.hidden = true;
  els.errorPanel.textContent = "";
}

function showLocationSetup(show) {
  els.locationSetup.hidden = !show;
}

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

async function loadAll(location) {
  clearError();
  els.locationName.textContent = location.cityState;

  const today = new Date();
  els.nowDay.textContent = today.toLocaleDateString([], { weekday: "long" });
  els.nowDate.textContent = formatDate(today);

  let meta;
  try {
    meta = await fetchPointMeta(location.lat, location.lon);

    const fmt = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    els.nowSun.textContent =
      meta.sunrise && meta.sunset ? `Sunrise ${fmt(meta.sunrise)}\nSunset ${fmt(meta.sunset)}` : "";
  } catch (err) {
    console.error(err);
    els.nowSun.textContent = "";
  }

  try {
    if (!meta) throw new Error("location metadata unavailable");
    const [obs, gridSeries] = await Promise.all([
      fetchLatestObservation(meta.stationsUrl),
      fetchGridSeries(meta.gridpointUrl, HOURS_TO_SHOW),
    ]);

    els.nowTemp.textContent = obs.temperatureF != null ? `${Math.round(obs.temperatureF)}°` : "--°";
    els.nowConditions.textContent = obs.textDescription || "--";
    els.nowDetail.textContent =
      obs.windSpeedMph != null ? `Wind ${Math.round(obs.windSpeedMph)} mph ${obs.windDirection}` : "";

    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = makeHourlyChart(
      els.chartHourly,
      gridSeries.timesMs,
      gridSeries.temperatureF,
      gridSeries.windSpeedMph,
      gridSeries.windDirectionDeg,
      gridSeries.probabilityOfPrecipitation,
      gridSeries.dewpointF,
      gridSeries.relativeHumidity,
      gridSeries.skyCover
    );
    cacheLastGood({ location, obs, gridSeries });
  } catch (err) {
    console.error(err);
    showError(`Weather data unavailable: ${err.message}`);
    restoreLastGood();
  }

  try {
    const pollen = await fetchPollen(location.lat, location.lon);
    const label = (type) => type.charAt(0) + type.slice(1).toLowerCase();
    els.pollenIndex.textContent = pollen.categories
      .map((c) => `${label(c.type)}: ${c.category ?? "N/A"}`)
      .join("\n");
    els.pollenTriggers.textContent =
      pollen.inSeasonPlants.map((p) => p.name).join(", ") || "No plants in season today";
  } catch (err) {
    console.error(err);
    els.pollenIndex.textContent = "--";
    els.pollenTriggers.textContent = "Pollen data unavailable";
  }

  els.updatedAt.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const CACHE_KEY = "nwpwa.lastGood";

function cacheLastGood(snapshot) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...snapshot, cachedAt: Date.now() }));
}

function restoreLastGood() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return;
  const snap = JSON.parse(raw);
  els.nowTemp.textContent = snap.obs.temperatureF != null ? `${Math.round(snap.obs.temperatureF)}°` : "--°";
  els.nowConditions.textContent = snap.obs.textDescription || "--";
  els.nowDetail.textContent =
    snap.obs.windSpeedMph != null ? `Wind ${Math.round(snap.obs.windSpeedMph)} mph ${snap.obs.windDirection}` : "";
  els.updatedAt.textContent = `Stale — last updated ${new Date(snap.cachedAt).toLocaleString()}`;
}

async function init() {
  const saved = getSavedLocation();
  if (saved) {
    showLocationSetup(false);
    await loadAll(saved);
  } else {
    showLocationSetup(true);
    els.locationName.textContent = "Set a location to begin";
  }
}

els.locationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const zip = els.zipInput.value.trim();
  try {
    const location = await resolveLocationFromZip(zip);
    showLocationSetup(false);
    await loadAll(location);
  } catch (err) {
    showError(err.message);
  }
});

els.changeLocationBtn.addEventListener("click", () => {
  showLocationSetup(true);
});

els.refreshBtn.addEventListener("click", () => {
  const saved = getSavedLocation();
  if (saved) loadAll(saved);
});

els.legendToggle.addEventListener("click", () => {
  els.legendRow.hidden = !els.legendRow.hidden;
  els.hourlySection.classList.toggle("legend-hidden", els.legendRow.hidden);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.error("SW registration failed", err));
  });
}

init();
