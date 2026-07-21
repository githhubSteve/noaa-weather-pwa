// Zippopotam.us: free, keyless, CORS-open (confirmed: access-control-allow-origin: *).
async function zipToLatLon(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) throw new Error(`Unknown ZIP code: ${zip}`);
  const data = await res.json();
  const place = data.places[0];
  return {
    lat: Number(place.latitude),
    lon: Number(place.longitude),
    cityState: `${place["place name"]}, ${place["state abbreviation"]}`,
  };
}

export { zipToLatLon };
