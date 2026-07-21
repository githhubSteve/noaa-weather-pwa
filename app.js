import { fetchPointMeta, fetchHourlyForecast, fetchGridSeries } from "./src/nws.js";
import { fetchPollen } from "./src/pollen.js";
import { getSavedLocation, resolveLocationFromZip } from "./src/location.js";
import { makeHourlyChart, makeQpfBarStrip, PX_PER_HOUR } from "./src/chart.js";

const HOURS_TO_SHOW = 168; // 7 days
const HOUR_AXIS_STEP = 4; // label every 4 hours, matching the reference app's cadence

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
  hourlyScroll: $("hourly-scroll"),
  chartHourly: $("chart-hourly"),
  chartQpf: $("chart-qpf"),
  hourAxis: $("hour-axis"),
  scrubber: $("scrubber"),
  scrubberDayLabel: $("scrubber-day-label"),
  pollenIndex: $("pollen-index"),
  pollenTriggers: $("pollen-triggers"),
  errorPanel: $("error-panel"),
};

let hourlyChart = null;
let currentTimesMs = [];

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

function renderHourAxis(timesMs) {
  els.hourAxis.innerHTML = "";
  for (let i = 0; i < timesMs.length; i += HOUR_AXIS_STEP) {
    const span = document.createElement("span");
    span.style.left = `${i * PX_PER_HOUR + PX_PER_HOUR / 2}px`;
    span.textContent = new Date(timesMs[i])
      .toLocaleTimeString([], { hour: "numeric" })
      .replace(" ", "")
      .toLowerCase();
    els.hourAxis.appendChild(span);
  }
  els.hourAxis.style.width = `${timesMs.length * PX_PER_HOUR}px`;
}

function centerTimeIndex() {
  const container = els.hourlyScroll;
  const centerPx = container.scrollLeft + container.clientWidth / 2;
  const idx = Math.round(centerPx / PX_PER_HOUR);
  return Math.min(currentTimesMs.length - 1, Math.max(0, idx));
}

function updateScrubberFromScroll() {
  const container = els.hourlyScroll;
  const maxScroll = container.scrollWidth - container.clientWidth;
  const frac = maxScroll > 0 ? container.scrollLeft / maxScroll : 0;
  els.scrubber.value = Math.round(frac * 1000);

  const idx = centerTimeIndex();
  if (currentTimesMs[idx] != null) {
    els.scrubberDayLabel.textContent = new Date(currentTimesMs[idx]).toLocaleDateString([], {
      weekday: "long",
    });
  }
}

els.scrubber.addEventListener("input", () => {
  const container = els.hourlyScroll;
  const maxScroll = container.scrollWidth - container.clientWidth;
  container.scrollLeft = (els.scrubber.value / 1000) * maxScroll;
  updateScrubberFromScroll();
});

els.hourlyScroll.addEventListener("scroll", updateScrubberFromScroll);

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

    currentTimesMs = gridSeries.timesMs;

    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = makeHourlyChart(
      els.chartHourly,
      gridSeries.timesMs,
      gridSeries.temperatureF,
      gridSeries.windSpeedMph,
      gridSeries.probabilityOfPrecipitation
    );
    makeQpfBarStrip(els.chartQpf, gridSeries.timesMs, gridSeries.quantitativePrecipitationIn);
    renderHourAxis(gridSeries.timesMs);
    els.hourlyScroll.scrollLeft = 0;
    updateScrubberFromScroll();

    cacheLastGood({ location, now, gridSeries });
  } catch (err) {
    console.error(err);
    showError(`Weather data unavailable: ${err.message}`);
    restoreLastGood();
  }

  try {
    if (!location.zip) throw new Error("no ZIP set for pollen lookup");
    const pollen = await fetchPollen(location.zip);
    els.pollenIndex.textContent = pollen.index.toFixed(1);
    els.pollenTriggers.textContent = pollen.triggers.join(", ") || "No major triggers today";
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.error("SW registration failed", err));
  });
}

init();
