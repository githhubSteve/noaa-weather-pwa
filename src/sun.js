// sunrise-sunset.org: free, keyless, CORS-open (confirmed: access-control-allow-origin: *).
// Chose this over a hand-rolled solar-position formula after verifying the
// formula's sunset was accurate but sunrise consistently ran 2-4 minutes
// late across multiple test locations for reasons that weren't obviously
// fixable -- not worth shipping an unverified time as fact when a correct
// free source exists.
async function fetchSunTimes(lat, lon, date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10);
  const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${dateStr}&formatted=0`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sunrise/sunset request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.status !== "OK") {
    throw new Error(`Sunrise/sunset API error: ${data.status}`);
  }
  return {
    sunrise: new Date(data.results.sunrise),
    sunset: new Date(data.results.sunset),
  };
}

export { fetchSunTimes };
