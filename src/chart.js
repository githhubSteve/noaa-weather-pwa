// Thin wrapper around the vendored uPlot (loaded globally via vendor/uplot.iife.min.js).
// Everything here fits the full 7-day hourly window into the container's actual
// width -- no horizontal scrolling, no per-hour fixed pixel size.

const COLOR_TEMP = "#e8d44f";
const COLOR_WIND = "#3ddc72";
const COLOR_PRECIP = "#4fa3ff";
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
// chart width. Temperature gets both high and low (the classic "H/L"
// convention); wind and precip only get a daily high.
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

// Combined temperature / wind speed / precip-probability line chart, all
// sharing one y-scale (mirrors the reference app's layout), fit to the
// container's actual width so the full 7-day window shows with no scrolling.
// Day names are rendered as the chart's own native x-axis (custom splits/
// values at each day's center) rather than a separately-positioned HTML row --
// that guarantees they land exactly under their matching day/night band,
// since both are drawn through the same uPlot coordinate system.
function makeHourlyChart(container, timesMs, temperatureF, windSpeedMph, precipPct) {
  const width = container.clientWidth;
  const yMax = niceMax([...temperatureF, ...windSpeedMph, ...precipPct]);
  const dayGroups = groupByDay(timesMs);
  const xData = timesMs.map((t) => t / 1000);
  const dayCenters = dayGroups.map((g) => (xData[g.startIdx] + xData[g.endIdx]) / 2);

  const data = [xData, temperatureF, windSpeedMph, precipPct];

  const opts = {
    width,
    height: 240,
    padding: [4, 8, 0, 8],
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
      { stroke: AXIS_COLOR, label: "" },
    ],
    series: [
      {},
      { label: "Temperature (°F)", stroke: COLOR_TEMP, width: 1, points: { show: false } },
      { label: "Wind Speed (mph)", stroke: COLOR_WIND, width: 1, points: { show: false } },
      { label: "Precip Chance (%)", stroke: COLOR_PRECIP, width: 0.5, dash: [6, 4], points: { show: false } },
    ],
    plugins: [
      dayNightBackgroundPlugin(),
      dailyExtremesPlugin(
        [
          { idx: 1, color: COLOR_TEMP, showLow: true },
          { idx: 2, color: COLOR_WIND, showLow: false },
          { idx: 3, color: COLOR_PRECIP, showLow: false },
        ],
        dayGroups
      ),
    ],
    legend: { show: false },
  };
  return new uPlot(opts, data, container);
}

export { makeHourlyChart, groupByDay };
