// Thin wrapper around the vendored uPlot (loaded globally via vendor/uplot.iife.min.js).
// Everything here fits the full 7-day hourly window into the container's actual
// width -- no horizontal scrolling, no per-hour fixed pixel size.

const COLOR_TEMP = "#e8d44f";
const COLOR_WIND = "#3ddc72";
const COLOR_PRECIP = "#4fa3ff";

// Fixed civil-twilight approximation (8pm-6am) rather than a real sunrise/sunset
// calculation -- good enough for a background shading cue, not worth a second
// API call for.
function isNightHour(ms) {
  const h = new Date(ms).getHours();
  return h >= 20 || h < 6;
}

function niceMax(values, floor = 100) {
  const max = Math.max(floor, ...values.filter((v) => v != null));
  return Math.ceil(max / 10) * 10;
}

// Groups the hourly grid into contiguous calendar-day chunks (the grid starts
// at "now", not midnight, so the first/last chunks can be partial days).
function groupByDay(timesMs) {
  const groups = [];
  let current = null;
  timesMs.forEach((t, i) => {
    const dateStr = new Date(t).toDateString();
    if (!current || current.dateStr !== dateStr) {
      current = { dateStr, startIdx: i, endIdx: i };
      groups.push(current);
    } else {
      current.endIdx = i;
    }
  });
  return groups;
}

// Shades night hours with a subtle dark overlay, drawn via uPlot's `drawClear`
// hook so it renders behind the axes/series (the standard uPlot "time regions"
// background-highlight pattern).
function dayNightBackgroundPlugin() {
  return {
    hooks: {
      drawClear: [
        (u) => {
          const ctx = u.ctx;
          const xData = u.data[0];
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          let bandStart = null;
          for (let i = 0; i <= xData.length; i++) {
            const night = i < xData.length && isNightHour(xData[i] * 1000);
            if (night && bandStart == null) {
              bandStart = xData[i];
            } else if (!night && bandStart != null) {
              const x0 = u.valToPos(bandStart, "x", true);
              const x1 = u.valToPos(xData[i - 1], "x", true);
              ctx.fillRect(x0, u.bbox.top, Math.max(1, x1 - x0), u.bbox.height);
              bandStart = null;
            }
          }
          ctx.restore();
        },
      ],
    },
  };
}

// Labels only each day's temperature high and low (not every point) -- the
// classic weather-app "H/L" convention, and the only way to keep labels
// legible once 7 days are squeezed into one non-scrolling chart width.
function dailyHighLowPlugin(tempSeriesIdx, dayGroups) {
  return {
    hooks: {
      draw: [
        (u) => {
          const ctx = u.ctx;
          const xData = u.data[0];
          const temp = u.data[tempSeriesIdx];
          ctx.save();
          ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = COLOR_TEMP;
          dayGroups.forEach(({ startIdx, endIdx }) => {
            let hiIdx = startIdx;
            let loIdx = startIdx;
            for (let i = startIdx; i <= endIdx; i++) {
              if (temp[i] == null) continue;
              if (temp[i] > temp[hiIdx]) hiIdx = i;
              if (temp[i] < temp[loIdx]) loIdx = i;
            }
            [hiIdx, loIdx].forEach((idx) => {
              const v = temp[idx];
              if (v == null) return;
              const x = u.valToPos(xData[idx], "x", true);
              const y = u.valToPos(v, "y", true);
              ctx.fillText(Math.round(v), x, y - 8);
            });
          });
          ctx.restore();
        },
      ],
    },
  };
}

// Combined temperature / wind speed / precip-probability line chart, all
// sharing one y-scale (mirrors the reference app's layout), fit to the
// container's actual width so the full 7-day window shows with no scrolling.
function makeHourlyChart(container, timesMs, temperatureF, windSpeedMph, precipPct) {
  const width = container.clientWidth;
  const yMax = niceMax([...temperatureF, ...windSpeedMph, ...precipPct]);
  const dayGroups = groupByDay(timesMs);

  const data = [timesMs.map((t) => t / 1000), temperatureF, windSpeedMph, precipPct];

  const opts = {
    width,
    height: 240,
    scales: { x: { time: true }, y: { range: [0, yMax] } },
    axes: [{ show: false }, { label: "" }],
    series: [
      {},
      { label: "Temperature (°F)", stroke: COLOR_TEMP, width: 2, points: { show: false } },
      { label: "Wind Speed (mph)", stroke: COLOR_WIND, width: 2, points: { show: false } },
      { label: "Precip Chance (%)", stroke: COLOR_PRECIP, width: 1.5, dash: [6, 4], points: { show: false } },
    ],
    plugins: [dayNightBackgroundPlugin(), dailyHighLowPlugin(1, dayGroups)],
    legend: { show: false },
  };
  return new uPlot(opts, data, container);
}

// Plain div/CSS bar strip for QPF (liquid precip amount), fit to the same
// container width as the hourly chart above (no scrolling, no fixed px/hour).
// Not a uPlot series: the published uPlot build doesn't bundle a bars path
// renderer (only `points`), and guessing at its undocumented custom-paths
// return shape isn't worth the risk for something this simple.
function makeQpfBarStrip(container, timesMs, qpfIn) {
  const width = container.clientWidth;
  const height = 60;
  const maxVal = Math.max(0.1, ...qpfIn.filter((v) => v != null));
  const axisMax = Math.ceil(maxVal / 0.05) * 0.05;
  const slotWidth = width / timesMs.length;

  container.innerHTML = "";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;

  const barWidth = Math.max(1, slotWidth * 0.7);
  qpfIn.forEach((v, i) => {
    if (!v) return;
    const barHeight = Math.round((v / axisMax) * height);
    const bar = document.createElement("div");
    bar.className = "qpf-bar";
    bar.style.left = `${i * slotWidth + slotWidth / 2 - barWidth / 2}px`;
    bar.style.width = `${barWidth}px`;
    bar.style.height = `${barHeight}px`;
    container.appendChild(bar);
  });

  return { axisMax };
}

// Day-name labels (e.g. "Wed") centered under each calendar day's span,
// replacing the old hourly time axis + scrubber now that days are squeezed
// together with no scroll to seek through.
function renderDayAxis(container, timesMs) {
  const width = container.clientWidth;
  const slotWidth = width / timesMs.length;
  const dayGroups = groupByDay(timesMs);

  container.innerHTML = "";
  container.style.width = `${width}px`;
  dayGroups.forEach(({ dateStr, startIdx, endIdx }) => {
    const centerIdx = (startIdx + endIdx) / 2;
    const span = document.createElement("span");
    span.style.left = `${centerIdx * slotWidth + slotWidth / 2}px`;
    span.textContent = new Date(dateStr).toLocaleDateString([], { weekday: "short" });
    container.appendChild(span);
  });
}

export { makeHourlyChart, makeQpfBarStrip, renderDayAxis, groupByDay };
