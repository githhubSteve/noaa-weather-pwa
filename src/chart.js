// Thin wrapper around the vendored uPlot (loaded globally via vendor/uplot.iife.min.js).

function makeTempPrecipChart(container, timesMs, temperatureF, precipPct) {
  const data = [
    timesMs.map((t) => t / 1000),
    temperatureF,
    precipPct,
  ];
  const opts = {
    width: container.clientWidth,
    height: 220,
    scales: { x: { time: true }, precip: { range: [0, 100] } },
    axes: [
      {},
      { scale: "y", label: "°F" },
      { scale: "precip", side: 1, label: "% precip", grid: { show: false } },
    ],
    series: [
      {},
      { label: "Temperature (°F)", stroke: "#4fa3ff", width: 2, points: { show: false } },
      { label: "Precip chance (%)", scale: "precip", stroke: "#ff9d4f", width: 1.5, points: { show: false }, fill: "rgba(255,157,79,0.15)" },
    ],
  };
  return new uPlot(opts, data, container);
}

function makeHumiditySkyChart(container, timesMs, humidityPct, skyCoverPct) {
  const data = [
    timesMs.map((t) => t / 1000),
    humidityPct,
    skyCoverPct,
  ];
  const opts = {
    width: container.clientWidth,
    height: 220,
    scales: { x: { time: true }, y: { range: [0, 100] } },
    axes: [{}, { label: "%" }],
    series: [
      {},
      { label: "Humidity (%)", stroke: "#4fa3ff", width: 2, points: { show: false } },
      { label: "Sky cover (%)", stroke: "#8fa0bb", width: 1.5, points: { show: false }, fill: "rgba(143,160,187,0.12)" },
    ],
  };
  return new uPlot(opts, data, container);
}

export { makeTempPrecipChart, makeHumiditySkyChart };
