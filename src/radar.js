// NWS RIDGE radar serves both a pre-baked "_loop.gif" (animated GIF) and the
// individual frames it's built from ("_0.gif" = newest ... "_N.gif" = oldest).
// We drive the animation ourselves from the individual frames instead of
// using the animated GIF directly: iOS Safari pauses animated GIFs under Low
// Power Mode (a native <img> would silently freeze on one frame), but a plain
// <img src> swap on a timer keeps working regardless of that setting.
const FRAME_COUNT = 10; // KFWS_0.gif..KFWS_9.gif confirmed present; _10 404s
const FRAME_MS = 400; // per-frame advance while animating through history
const HOLD_MS = 1400; // extra pause on the newest frame before looping

function frameUrl(station, index) {
  return `https://radar.weather.gov/ridge/standard/${station}_${index}.gif`;
}

// Starts cycling oldest -> newest -> (hold) -> oldest through the given
// <img> element. Returns a stop function; callers must call it before
// starting a new loop (e.g. on refresh/location change) to avoid stacking
// intervals.
function startRadarLoop(imgEl, station) {
  const urls = [];
  for (let i = FRAME_COUNT - 1; i >= 0; i--) urls.push(frameUrl(station, i));
  urls.forEach((u) => {
    new Image().src = u; // preload so playback doesn't stutter on first pass
  });

  let i = 0;
  let timer = null;

  function tick() {
    imgEl.src = urls[i];
    const atNewest = i === urls.length - 1;
    i = (i + 1) % urls.length;
    timer = setTimeout(tick, atNewest ? HOLD_MS : FRAME_MS);
  }
  tick();

  return () => {
    if (timer) clearTimeout(timer);
  };
}

export { startRadarLoop };
