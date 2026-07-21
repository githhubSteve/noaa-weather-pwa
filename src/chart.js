// Thin wrapper around the vendored uPlot (loaded globally via vendor/uplot.iife.min.js).

const PX_PER_HOUR = 30;
const LABEL_STEP_HOURS = 3;

const COLOR_TEMP = "#e8d44f";
const COLOR_WIND = "#3ddc72";
const COLOR_PRECIP = "#4fa3ff";

function niceMax(values, floor = 100) {
  const max = Math.max(floor, ...values.filter((v) => v != null));
  return Math.ceil(max / 10) * 10;
}

// Draws the value next to every LABEL_STEP_HOURS-th point, in that series' color.
// This is the documented uPlot "hooks.draw" pattern (used for annotations/overlays):
// it runs after uPlot finishes its own canvas drawing, with u.ctx/u.valToPos ready.
function pointLabelsPlugin(seriesIndices, colors, decimals = 0) {
  return {
    hooks: {
      draw: [
        (u) => {
          const ctx = u.ctx;
          ctx.save();
          ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textAlign = "center";
          seriesIndices.forEach((sIdx, colorIdx) => {
            const xData = u.data[0];
            const yData = u.data[sIdx];
            ctx.fillStyle = colors[colorIdx];
            for (let i = 0; i < xData.length; i += LABEL_STEP_HOURS) {
              const v = yData[i];
              if (v == null) continue;
              const x = u.valToPos(xData[i], "x", true);
              const y = u.valToPos(v, "y", true);
              ctx.fillText(v.toFixed(decimals), x, y - 8);
            }
          });
          ctx.restore();
        },
      ],
    },
  };
}

// Combined temperature / wind speed / precip-probability line chart, all sharing
// one y-scale (mirrors the reference app's layout). Width scales with the number
// of hours so the caller can wrap it in a horizontally-scrollable container.
function makeHourlyChart(container, timesMs, temperatureF, windSpeedMph, precipPct) {
  const width = timesMs.length * PX_PER_HOUR;
  const yMax = niceMax([...temperatureF, ...windSpeedMph, ...precipPct]);

  const data = [timesMs.map((t) => t / 1000), temperatureF, windSpeedMph, precipPct];

  const opts = {
    width,
    height: 260,
    scales: { x: { time: true }, y: { range: [0, yMax] } },
    axes: [{ space: PX_PER_HOUR * LABEL_STEP_HOURS }, { label: "" }],
    series: [
      {},
      { label: "Temperature (°F)", stroke: COLOR_TEMP, width: 2, points: { show: false } },
      { label: "Wind Speed (mph)", stroke: COLOR_WIND, width: 2, points: { show: false } },
      { label: "Precip Chance (%)", stroke: COLOR_PRECIP, width: 1.5, dash: [6, 4], points: { show: false } },
    ],
    plugins: [pointLabelsPlugin([1, 2, 3], [COLOR_TEMP, COLOR_WIND, COLOR_PRECIP])],
    legend: { show: false },
  };
  return new uPlot(opts, data, container);
}

// Plain div/CSS bar strip for QPF (liquid precip amount). Deliberately not a
// uPlot series: the published uPlot build doesn't bundle a bars path renderer
// (only `points`), and guessing at its undocumented custom-paths return shape
// isn't worth the risk for something this simple. Same total width as the
// hourly chart above so both scroll in sync inside a shared container.
function makeQpfBarStrip(container, timesMs, qpfIn) {
  const width = timesMs.length * PX_PER_HOUR;
  const height = 80;
  const maxVal = Math.max(0.1, ...qpfIn.filter((v) => v != null));
  const axisMax = Math.ceil(maxVal / 0.05) * 0.05;

  container.innerHTML = "";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;

  const barWidth = Math.max(1, PX_PER_HOUR * 0.6);
  qpfIn.forEach((v, i) => {
    if (!v) return;
    const barHeight = Math.round((v / axisMax) * height);
    const bar = document.createElement("div");
    bar.className = "qpf-bar";
    bar.style.left = `${i * PX_PER_HOUR + PX_PER_HOUR / 2 - barWidth / 2}px`;
    bar.style.width = `${barWidth}px`;
    bar.style.height = `${barHeight}px`;
    container.appendChild(bar);
  });

  return { axisMax };
}

export { makeHourlyChart, makeQpfBarStrip, PX_PER_HOUR };
