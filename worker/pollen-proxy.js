// Cloudflare Worker: CORS proxy for pollen.com's unofficial forecast API.
// pollen.com sends no Access-Control-Allow-Origin header, so the browser
// can't call it directly from the PWA's origin -- this worker re-forwards
// the request server-side (no CORS restriction there) and adds the header
// back on the way out.
//
// Deploy: wrangler deploy  (see worker/wrangler.toml)
// Usage:  GET https://<your-worker>.workers.dev/pollen/76244

const ALLOWED_ORIGIN = "*"; // tighten to your GitHub Pages origin once deployed

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/pollen\/(\d{5})$/);

    if (!match) {
      return new Response("Not found. Use /pollen/{zip}", { status: 404 });
    }
    const zip = match[1];

    const upstream = await fetch(`https://www.pollen.com/api/forecast/current/pollen/${zip}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.pollen.com/",
        Accept: "application/json",
      },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Cache-Control": "public, max-age=3600", // pollen.com updates daily; avoid hammering it
      },
    });
  },
};
