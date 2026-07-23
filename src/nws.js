// Browsers forbid setting User-Agent via fetch(); NWS accepts unauthenticated
// browser requests fine (confirmed CORS: Access-Control-Allow-Origin: *).
async function getJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/geo+json" },
  });
  if (!res.ok) {
    throw new Error(`NWS request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.json();
}

// Parses an ISO-8601 duration like "PT6H", "P1D", "PT7H30M" into milliseconds.
function parseIsoDuration(iso) {
  const m = iso.match(
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );
  if (!m) throw new Error(`Unrecognized ISO-8601 duration: ${iso}`);
  const [, y, mo, w, d, h, mi, s] = m;
  const days = (Number(y) || 0) * 365 + (Number(mo) || 0) * 30 + (Number(w) || 0) * 7 + (Number(d) || 0);
  return (
    days * 86400000 +
    (Number(h) || 0) * 3600000 +
    (Number(mi) || 0) * 60000 +
    (Number(s) || 0) * 1000
  );
}

// Each gridpoint value is "validTime": "<startISO>/<durationISO>".
// Returns [{ startMs, endMs, value }], sorted ascending (NWS already returns them sorted).
function parseValueSeries(values) {
  return values.map(({ validTime, value }) => {
    const [startIso, durationIso] = validTime.split("/");
    const startMs = new Date(startIso).getTime();
    const endMs = startMs + parseIsoDuration(durationIso);
    return { startMs, endMs, value };
  });
}

// Samples a parsed interval series onto a fixed array of epoch-ms grid points,
// carrying the last known value forward across its interval (step-hold).
// Returns null for grid points before the first interval starts.
function sampleAtGrid(intervals, gridMs) {
  const out = new Array(gridMs.length).fill(null);
  let i = 0;
  for (let g = 0; g < gridMs.length; g++) {
    const t = gridMs[g];
    while (i < intervals.length - 1 && intervals[i].endMs <= t) i++;
    const cur = intervals[i];
    if (cur && t >= cur.startMs) {
      out[g] = cur.value;
    } else if (cur && g > 0) {
      out[g] = out[g - 1]; // carry forward through small gaps
    }
  }
  return out;
}

function hourlyGrid(startMs, hours) {
  const grid = [];
  const start = Math.floor(startMs / 3600000) * 3600000; // align to top of hour
  for (let h = 0; h < hours; h++) grid.push(start + h * 3600000);
  return grid;
}

async function fetchPointMeta(lat, lon) {
  const points = await getJson(`https://api.weather.gov/points/${lat},${lon}`);
  const props = points.properties;
  const astro = props.astronomicalData;
  return {
    gridId: props.gridId,
    gridX: props.gridX,
    gridY: props.gridY,
    hourlyUrl: props.forecastHourly,
    gridpointUrl: props.forecastGridData,
    stationsUrl: props.observationStations,
    radarStation: props.radarStation,
    // NWS already returns real sunrise/sunset from this same /points/ call --
    // no separate API needed for it.
    sunrise: astro?.sunrise ? new Date(astro.sunrise) : null,
    sunset: astro?.sunset ? new Date(astro.sunset) : null,
    cityState: props.relativeLocation
      ? `${props.relativeLocation.properties.city}, ${props.relativeLocation.properties.state}`
      : null,
  };
}

const CELSIUS_TO_F = (c) => (c * 9) / 5 + 32;
const KMH_TO_MPH = (k) => k * 0.621371;

// Real measured conditions from the nearest physical station, not a forecast
// guess for the current hour -- station reports the actual current instant,
// updated roughly hourly.
async function fetchLatestObservation(stationsUrl) {
  const stations = await getJson(stationsUrl);
  const stationUrl = stations.features[0].id;
  const obs = await getJson(`${stationUrl}/observations/latest`);
  const props = obs.properties;
  return {
    temperatureF: props.temperature?.value != null ? CELSIUS_TO_F(props.temperature.value) : null,
    textDescription: props.textDescription,
    timestamp: props.timestamp,
  };
}

// Builds aligned hourly series (temp °F, wind mph, precip chance %, dew point
// °F, humidity %, cloud cover %) for the next `hours` hours, starting now,
// from the raw gridpoint payload.
async function fetchGridSeries(gridpointUrl, hours = 48) {
  const data = await getJson(gridpointUrl);
  const props = data.properties;
  const grid = hourlyGrid(Date.now(), hours);

  const seriesFor = (key, convert = (v) => v) => {
    const raw = props[key]?.values;
    if (!raw || !raw.length) return grid.map(() => null);
    const intervals = parseValueSeries(raw);
    return sampleAtGrid(intervals, grid).map((v) => (v == null ? null : convert(v)));
  };

  return {
    timesMs: grid,
    temperatureF: seriesFor("temperature", CELSIUS_TO_F),
    windSpeedMph: seriesFor("windSpeed", KMH_TO_MPH),
    windDirectionDeg: seriesFor("windDirection"),
    probabilityOfPrecipitation: seriesFor("probabilityOfPrecipitation"),
    dewpointF: seriesFor("dewpoint", CELSIUS_TO_F),
    relativeHumidity: seriesFor("relativeHumidity"),
    skyCover: seriesFor("skyCover"),
  };
}

export {
  fetchPointMeta,
  fetchGridSeries,
  fetchLatestObservation,
  parseIsoDuration,
  parseValueSeries,
  sampleAtGrid,
  hourlyGrid,
};
