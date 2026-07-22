// Cloudflare Worker: proxy for the Google Pollen API.
//
// Two jobs: (1) keep the API key server-side -- this Worker is the only
// place that ever sees it (set via `wrangler secret put GOOGLE_POLLEN_API_KEY`,
// never committed, never shipped to the browser), and (2) add back a CORS
// header, since Google's API isn't meant to be called with a key exposed in
// client-side JS in the first place.
//
// Deploy: wrangler deploy  (see worker/wrangler.toml)
// Usage:  GET https://<your-worker>.workers.dev/pollen/{lat}/{lon}

const ALLOWED_ORIGIN = "https://githhubsteve.github.io";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/pollen\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);

    if (!match) {
      return new Response("Not found. Use /pollen/{lat}/{lon}", { status: 404 });
    }
    const [, lat, lon] = match;

    const googleUrl = new URL("https://pollen.googleapis.com/v1/forecast:lookup");
    googleUrl.searchParams.set("key", env.GOOGLE_POLLEN_API_KEY);
    googleUrl.searchParams.set("location.latitude", lat);
    googleUrl.searchParams.set("location.longitude", lon);
    googleUrl.searchParams.set("days", "1");

    const upstream = await fetch(googleUrl);
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Cache-Control": "public, max-age=3600", // pollen data updates daily
      },
    });
  },
};
