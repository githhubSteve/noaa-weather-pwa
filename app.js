import { fetchPointMeta, fetchHourlyForecast, fetchGridSeries } from "./src/nws.js";
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
  nowTemp: $("now-temp"),
  nowConditions: $("now-conditions"),
  nowDetail: $("now-detail"),
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

async function loadAll(location) {
  clearError();
  els.locationName.textContent = location.cityState;

  try {
    const meta = await fetchPointMeta(location.lat, location.lon);
    const [hourly, gridSeries] = await Promise.all([
      fetchHourlyForecast(meta.hourlyUrl),
      fetchGridSeries(meta.gridpointUrl, HOURS_TO_SHOW),
    ]);

    const now = hourly[0];
    els.nowTemp.textContent = `${now.temperature}°`;
    els.nowConditions.textContent = now.shortForecast;
    els.nowDetail.textContent = `Wind ${now.windSpeed} ${now.windDirection}`;

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
    cacheLastGood({ location, now, gridSeries });
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
  els.nowTemp.textContent = `${snap.now.temperature}°`;
  els.nowConditions.textContent = snap.now.shortForecast;
  els.nowDetail.textContent = `Wind ${snap.now.windSpeed} ${snap.now.windDirection}`;
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
