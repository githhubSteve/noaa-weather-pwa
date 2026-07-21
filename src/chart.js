// Thin wrapper around the vendored uPlot (loaded globally via vendor/uplot.iife.min.js).
// Everything here fits the full 7-day hourly window into the container's actual
// width -- no horizontal scrolling, no per-hour fixed pixel size.

const COLOR_TEMP = "#f2e04a";
const COLOR_WIND = "#5fe045";
const COLOR_PRECIP = "#4fa3ff";
const COLOR_DEWPOINT = "#ff9d3c";
const COLOR_HUMIDITY = "#ff33cc";
const COLOR_CLOUD = "#ffffff";
const AXIS_COLOR = "#f3f6fc";
const LABEL_FONT_SIZE = 11;
const LABEL_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, sans-serif";

// Canvas font sizes are in physical canvas pixels, not CSS pixels -- on a
// high-DPI screen (e.g. an iPhone at 3x) the canvas is internally scaled up
// by devicePixelRatio, so an unscaled "11px" renders visually tiny compared
// to the same value on a 1x desktop display. uPlot's own axis labels already
// account for this; our custom-drawn labels need to do it explicitly.
function labelFont(u) {
  return `300 ${LABEL_FONT_SIZE * u.pxRatio}px ${LABEL_FONT_FAMILY}`;
}

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

// Labels each day's extreme point(s) instead of every hour -- the only label
// density that stays legible once 7 days are squeezed into one non-scrolling
// chart width. Series flagged `showLow` get both a daily high and low (the
// classic temperature "H/L" convention); others get a daily high only.
function dailyExtremesPlugin(seriesConfigs, dayGroups) {
  return {
    hooks: {
      draw: [
        (u) => {
          const ctx = u.ctx;
          const xData = u.data[0];
          ctx.save();
          ctx.font = labelFont(u);
          ctx.textAlign = "center";
          seriesConfigs.forEach(({ idx, color, showLow }) => {
            const series = u.data[idx];
            ctx.fillStyle = color;
            dayGroups.forEach(({ startIdx, endIdx }) => {
              let hiIdx = startIdx;
              let loIdx = startIdx;
              for (let i = startIdx; i <= endIdx; i++) {
                if (series[i] == null) continue;
                if (series[i] > series[hiIdx]) hiIdx = i;
                if (series[i] < series[loIdx]) loIdx = i;
              }
              const idxsToLabel = showLow ? [hiIdx, loIdx] : [hiIdx];
              idxsToLabel.forEach((idx2) => {
                const v = series[idx2];
                if (v == null) return;
                const x = u.valToPos(xData[idx2], "x", true);
                const y = u.valToPos(v, "y", true);
                ctx.fillText(Math.round(v), x, y - 8);
              });
            });
          });
          ctx.restore();
        },
      ],
    },
  };
}

// Draws one small arrow per day, centered above that day's column, rotated to
// the wind direction at that day's center hour. NWS gives direction as the
// meteorological "wind is coming FROM" bearing (0=N, 90=E, ...); rotating by
// +180 points the arrow the way the wind is actually blowing, which reads
// more intuitively than an arrow pointing "backward" into the wind.
function windArrowPlugin(windDirectionDeg, dayGroups) {
  return {
    hooks: {
      draw: [
        (u) => {
          const ctx = u.ctx;
          const xData = u.data[0];
          const len = 7 * u.pxRatio;
          const y = u.bbox.top - 13 * u.pxRatio;
          ctx.save();
          ctx.strokeStyle = COLOR_WIND;
          ctx.lineWidth = 1.3 * u.pxRatio;
          ctx.lineCap = "round";
          dayGroups.forEach(({ startIdx, endIdx }) => {
            const centerIdx = Math.round((startIdx + endIdx) / 2);
            const dir = windDirectionDeg[centerIdx];
            if (dir == null) return;
            const x = u.valToPos(xData[centerIdx], "x", true);
            const angleRad = (((dir + 180) % 360) * Math.PI) / 180;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angleRad);
            ctx.beginPath();
            ctx.moveTo(0, len / 2);
            ctx.lineTo(0, -len / 2);
            ctx.lineTo(-len * 0.3, -len / 2 + len * 0.35);
            ctx.moveTo(0, -len / 2);
            ctx.lineTo(len * 0.3, -len / 2 + len * 0.35);
            ctx.stroke();
            ctx.restore();
          });
          ctx.restore();
        },
      ],
    },
  };
}

// Shared builder for a combined multi-series line chart: all series share one
// dynamically-scaled y-axis, day/night shading, a native day-name x-axis
// (custom splits/values at each day's center, so labels land exactly under
// their matching band -- both come from the same uPlot coordinate system),
// and daily-extreme point labels. Fit to the container's actual width so the
// full 7-day window shows with no scrolling.
function buildCombinedChart(container, timesMs, seriesDefs, extraPlugins = []) {
  const width = container.clientWidth;
  const yMax = niceMax(seriesDefs.flatMap((s) => s.data));
  const dayGroups = groupByDay(timesMs);
  const xData = timesMs.map((t) => t / 1000);
  const dayCenters = dayGroups.map((g) => (xData[g.startIdx] + xData[g.endIdx]) / 2);

  const data = [xData, ...seriesDefs.map((s) => s.data)];

  const opts = {
    width,
    height: 240,
    // Left padding kept near-zero: the y-axis's own `size` already reserves
    // exactly the room its tick numbers need, so any extra left padding here
    // just becomes dead space before the numbers. Top padding is bumped up to
    // leave room for the wind-direction arrow row drawn above the plot area.
    padding: [22, 8, 0, 2],
    scales: { x: { time: true }, y: { range: [0, yMax] } },
    axes: [
      {
        stroke: AXIS_COLOR,
        grid: { show: false },
        ticks: { show: false },
        splits: () => dayCenters,
        filter: (u, splits) => splits,
        values: (u, splits) => splits.map((s) => new Date(s * 1000).toLocaleDateString([], { weekday: "short" })),
      },
      {
        stroke: AXIS_COLOR,
        // No `label` key at all (not even ""): uPlot reserves an extra fixed
        // ~30px "axis title" gutter whenever `label` is non-null, even an
        // empty string -- that hidden reservation was the big blank strip
        // between the container edge and the tick numbers.
        size: 30,
      },
    ],
    series: [
      {},
      ...seriesDefs.map((s) => ({
        label: s.label,
        stroke: s.color,
        width: s.width,
        dash: s.dash,
        points: { show: false },
      })),
    ],
    plugins: [
      dayNightBackgroundPlugin(),
      dailyExtremesPlugin(
        seriesDefs.map((s, i) => ({ idx: i + 1, color: s.color, showLow: s.showLow })),
        dayGroups
      ),
      ...extraPlugins,
    ],
    legend: { show: false },
  };
  return new uPlot(opts, data, container);
}

function makeHourlyChart(
  container,
  timesMs,
  temperatureF,
  windSpeedMph,
  windDirectionDeg,
  precipPct,
  dewpointF,
  relativeHumidity,
  skyCover
) {
  return buildCombinedChart(
    container,
    timesMs,
    [
      { data: temperatureF, label: "Temperature (°F)", color: COLOR_TEMP, width: 1, showLow: true },
      { data: windSpeedMph, label: "Wind Speed (mph)", color: COLOR_WIND, width: 1, showLow: false },
      { data: precipPct, label: "Precip Chance (%)", color: COLOR_PRECIP, width: 0.5, dash: [6, 4], showLow: false },
      { data: dewpointF, label: "Dew Point (°F)", color: COLOR_DEWPOINT, width: 1, showLow: false },
      { data: relativeHumidity, label: "Humidity (%)", color: COLOR_HUMIDITY, width: 0.5, showLow: false },
      { data: skyCover, label: "Cloud Cover (%)", color: COLOR_CLOUD, width: 0.5, showLow: false },
    ],
    [windArrowPlugin(windDirectionDeg, groupByDay(timesMs))]
  );
}

export { makeHourlyChart, groupByDay };
