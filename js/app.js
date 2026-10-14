const data = await fetch("data/wuyue-map-data.json").then((r) => r.json());
const chinaProvinces = await fetch("data/china-provinces.geojson").then((r) => r.json());

const ui = (data.palette && data.palette.ui) || {
  background: "#F3EDE2",
  ink: "#2C2A28",
  mutedInk: "#6E6A64",
  water: "#A8C0C4",
  accent: "#8B3A3A",
  cityStroke: "#3D4F56",
  cityFill: "rgba(91,124,138,0.18)",
};

const BOUNDS = [
  [116.65, 27.14],
  [122.84, 32.71],
];
// city-mode locked frame: Wu-Yue + a bit of inland China for migration context
const CITY_FRAME = [
  [112.2, 26.8],
  [123.2, 35.2],
];

const root = document.documentElement;
root.style.setProperty("--bg", ui.background);
root.style.setProperty("--text", ui.ink);
root.style.setProperty("--muted", ui.mutedInk);
root.style.setProperty("--accent", ui.accent);
root.style.setProperty("--ink", ui.ink);

const legendEl = document.getElementById("legend");
const branchList = document.getElementById("branchList");
const cityChips = document.getElementById("cityChips");
const cityMeta = document.getElementById("cityMeta");
const eventList = document.getElementById("eventList");
const playBtn = document.getElementById("playBtn");
const followMigrationEl = document.getElementById("followMigration");
const storyKicker = document.getElementById("storyKicker");
const storyTitle = document.getElementById("storyTitle");
const storyYear = document.getElementById("storyYear");
const storyBody = document.getElementById("storyBody");
const eraTimeline = document.getElementById("eraTimeline");
const eraProgressBar = document.getElementById("eraProgressBar");
const eraPrev = document.getElementById("eraPrev");
const eraNext = document.getElementById("eraNext");
const eraPlay = document.getElementById("eraPlay");
const timeAxisEl = document.getElementById("timeAxis");
const timeAxisDynasties = document.getElementById("timeAxisDynasties");
const timeAxisRanges = document.getElementById("timeAxisRanges");
const timeAxisTicks = document.getElementById("timeAxisTicks");
const timeAxisDots = document.getElementById("timeAxisDots");
const timeAxisNeedle = document.getElementById("timeAxisNeedle");

let mode = "branch";
let selectedBranchId = null;
let selectedCity = data.cities.find((c) => c.id === "yangzhou") || data.cities[0];
let selectedEventIdx = 0;
let eraIdx = 4;
let playTimer = null;
let eraPlayTimer = null;
let followMigration = false;
let cityFrameReady = false;
const labelMarkers = [];
const migMarkers = [];
const FOLLOW_ZOOM = 5.8;
let migArrows = null;

function yearText(y) {
  return y < 0 ? "前" + Math.abs(y) + "年" : y + "年";
}

const timelineMeta = data.timeline || {};
const AXIS_MIN = timelineMeta.yearStart != null ? timelineMeta.yearStart : -800;
const AXIS_MAX = timelineMeta.yearEnd != null ? timelineMeta.yearEnd : 2026;
const DYNASTY_COLORS = [
  "#E8D5C4", "#D9C4B0", "#E2D2B8", "#C9D5C4", "#B7C9BE",
  "#C5D0D6", "#D2C6D8", "#E0C9C0", "#D8C8A8", "#C4B8A8",
  "#D6B8B0", "#C8B0A0", "#B8C4C0",
];

function yearToPct(y) {
  const t = (Number(y) - AXIS_MIN) / (AXIS_MAX - AXIS_MIN);
  return Math.max(0, Math.min(100, t * 100));
}

function buildTimeAxisStatic() {
  const ticks = timelineMeta.ticks || [
    { year: -500, label: "前5世纪" },
    { year: 0, label: "公元" },
    { year: 500, label: "500" },
    { year: 1000, label: "1000" },
    { year: 1500, label: "1500" },
    { year: 2000, label: "今" },
  ];
  timeAxisTicks.innerHTML = ticks
    .map((t) => {
      const left = yearToPct(t.year);
      return `<div class="time-axis-tick" style="left:${left}%"><span>${t.label}</span></div>`;
    })
    .join("");

  const dynasties = timelineMeta.dynasties || [];
  timeAxisDynasties.innerHTML = dynasties
    .map((d, i) => {
      const left = yearToPct(d.yearStart);
      const right = yearToPct(d.yearEnd);
      const width = Math.max(0.4, right - left);
      const color = DYNASTY_COLORS[i % DYNASTY_COLORS.length];
      const showLabel = width >= 3.2;
      return `<div class="time-axis-dynasty" style="left:${left}%;width:${width}%;background:${color}" title="${d.label}（${yearText(d.yearStart)}–${yearText(d.yearEnd)}）">${showLabel ? `<span>${d.label}</span>` : ""}</div>`;
    })
    .join("");
}

function setTimeAxisVisible(on) {
  timeAxisEl.classList.toggle("hidden", !on);
}

function renderTimeAxisEra() {
  setTimeAxisVisible(true);
  timeAxisDots.innerHTML = "";
  timeAxisNeedle.classList.add("hidden");
  timeAxisRanges.innerHTML = data.eras
    .map((era, i) => {
      const left = yearToPct(era.yearStart);
      const right = yearToPct(era.yearEnd);
      const width = Math.max(0.8, right - left);
      const active = i === eraIdx ? " active" : "";
      const tip = `${era.label}${era.dynastyLabel ? " · " + era.dynastyLabel : ""}（${yearText(era.yearStart)}–${yearText(era.yearEnd)}）`;
      return `<div class="time-axis-range${active}" data-era-idx="${i}" style="left:${left}%;width:${width}%" title="${tip}"></div>`;
    })
    .join("");
  timeAxisRanges.querySelectorAll(".time-axis-range").forEach((el) => {
    el.addEventListener("click", () => {
      stopEraPlay();
      setEra(Number(el.dataset.eraIdx));
    });
  });
}

function renderTimeAxisCity() {
  setTimeAxisVisible(true);
  timeAxisRanges.innerHTML = "";
  const events = selectedCity.events || [];
  timeAxisDots.innerHTML = events
    .map((ev, i) => {
      const left = yearToPct(ev.year);
      const active = i === selectedEventIdx ? " active" : "";
      const tip = `${yearText(ev.year)} · ${ev.title}`;
      return `<button type="button" class="time-axis-dot${active}" data-ev-idx="${i}" style="left:${left}%" title="${tip}" aria-label="${tip}"></button>`;
    })
    .join("");
  timeAxisDots.querySelectorAll(".time-axis-dot").forEach((el) => {
    el.addEventListener("click", () => {
      stopCityPlay();
      selectedEventIdx = Number(el.dataset.evIdx);
      syncCityPanel();
      renderCityView({ camera: followMigration ? "follow" : "none" });
    });
  });
  const ev = events[selectedEventIdx];
  if (ev) {
    const pct = yearToPct(ev.year);
    timeAxisNeedle.style.left = `calc(12px + (100% - 24px) * ${pct / 100})`;
    timeAxisNeedle.classList.remove("hidden");
  } else {
    timeAxisNeedle.classList.add("hidden");
  }
}

function hideTimeAxis() {
  setTimeAxisVisible(false);
  timeAxisRanges.innerHTML = "";
  timeAxisDots.innerHTML = "";
  timeAxisNeedle.classList.add("hidden");
}

function shortTip(props) {
  if (props.shortTip) return props.shortTip;
  const s = props.summary || "";
  const tip = s.split(/[。；;]/)[0] || s;
  return tip.length > 48 ? tip.slice(0, 48) + "…" : tip;
}

function setStory({ kicker, title, year, body }) {
  storyKicker.textContent = kicker || "";
  storyTitle.textContent = title || "";
  storyYear.textContent = year || "";
  storyBody.textContent = body || "";
}

function clearMarkers(arr) {
  while (arr.length) {
    const m = arr.pop();
    m.remove();
  }
}

function makeLabel(text, className) {
  const el = document.createElement("div");
  el.className = "map-label" + (className ? " " + className : "");
  el.textContent = text;
  return el;
}

function citiesGeoJSON() {
  return {
    type: "FeatureCollection",
    features: data.cities.map((c) => ({
      type: "Feature",
      properties: { id: c.id, name: c.name, branch: c.branch },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    })),
  };
}

function branchCentroids() {
  return data.branchGeoJSON.features.map((f) => {
    const coords = [];
    const walk = (c) => {
      if (typeof c[0] === "number") coords.push(c);
      else c.forEach(walk);
    };
    walk(f.geometry.coordinates);
    let sx = 0, sy = 0;
    coords.forEach(([x, y]) => {
      sx += x;
      sy += y;
    });
    const n = Math.max(1, coords.length);
    return {
      id: f.properties.id,
      name: f.properties.name,
      lng: sx / n,
      lat: sy / n,
      fillColor: f.properties.fillColor,
    };
  });
}

function arcControl(from, to) {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  let px = -dy / len;
  let py = dx / len;
  // bulge toward higher latitude for short domestic hops
  if (py < 0) {
    px = -px;
    py = -py;
  }
  const mag = Math.min(1.35, Math.max(0.28, len * 0.24));
  return [mx + px * mag, my + py * mag];
}

function sampleQuadratic(from, to, control, n = 48) {
  // maplibre-arrows quadratic points order: [start, end, control]
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
    ]);
  }
  return pts;
}

function migrationBundle(ev, cityName) {
  if (!ev || !ev.from || !ev.to) {
    return {
      line: { type: "FeatureCollection", features: [] },
      fromName: "",
      toName: cityName || "终点",
      bounds: null,
      from: null,
      to: null,
      control: null,
      apex: null,
      mapLabel: "",
    };
  }
  const fromLng = ev.from[1];
  const fromLat = ev.from[0];
  const toLng = ev.to[1];
  const toLat = ev.to[0];
  let fromName = ev.fromName || "起点";
  let toName = ev.toName || cityName || "终点";
  if (ev.mapLabel && ev.mapLabel.includes("→")) {
    const parts = ev.mapLabel.split("→").map((s) => s.trim());
    if (parts[0]) fromName = parts[0];
    if (parts[1]) toName = parts[1];
  }
  const from = [fromLng, fromLat];
  const to = [toLng, toLat];
  const control = arcControl(from, to);
  const coords = sampleQuadratic(from, to, control);
  const apex = coords[Math.floor(coords.length / 2)];
  return {
    fromName,
    toName,
    from,
    to,
    control,
    apex,
    mapLabel: ev.mapLabel || fromName + " → " + toName,
    bounds: [
      [Math.min(fromLng, toLng, control[0]), Math.min(fromLat, toLat, control[1])],
      [Math.max(fromLng, toLng, control[0]), Math.max(fromLat, toLat, control[1])],
    ],
    line: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { fromName, toName, kind: "halo" },
          geometry: { type: "LineString", coordinates: coords },
        },
      ],
    },
  };
}

function ensureMigArrows() {
  const Arrows = globalThis.maplibreArrows;
  if (migArrows || typeof Arrows !== "function") return;
  // seed with accent so color layers exist (library has no setArrows)
  migArrows = new Arrows(map, {
    arrows: [
      {
        layout: "quadratic",
        lineColor: ui.accent,
        lineWidth: 4,
        points: [
          [119.0, 30.0],
          [120.0, 31.0],
          [119.4, 31.1],
        ],
        headScale: [1.45, 1.75],
      },
    ],
    sourceId: "mig-arc",
    layerIdPrefix: "mig-arc",
  });
  // map already past "load" — init sources/layers ourselves
  if (!map.getSource(migArrows.sourceId)) {
    migArrows.addSource();
    migArrows.addLayers();
  }
}

function updateMigArc(bundle) {
  ensureMigArrows();
  if (!migArrows) return;
  if (!bundle || !bundle.from || !bundle.to || !bundle.control) {
    migArrows.arrows = [];
    migArrows.jsonData = [];
    migArrows.updateSource();
    return;
  }
  // white underlay + cinnabar arc (same quadratic points)
  const pts = [bundle.from, bundle.to, bundle.control];
  migArrows.arrows = [
    {
      layout: "quadratic",
      lineColor: "#FFF8F0",
      lineWidth: 7,
      points: pts,
      headScale: [1.35, 1.55],
    },
    {
      layout: "quadratic",
      lineColor: ui.accent,
      lineWidth: 3.6,
      points: pts,
      headScale: [1.5, 1.85],
    },
  ];
  const nextColors = Array.from(
    new Set(migArrows.arrows.map((a) => a.lineColor || "black"))
  );
  // recreate tail layers if colors changed since first init
  for (const c of migArrows.lineColors) {
    const id = `${migArrows.layerIdPrefix}_tails_${c}`;
    if (map.getLayer(id) && !nextColors.includes(c)) map.removeLayer(id);
  }
  migArrows.lineColors = nextColors;
  migArrows.jsonData = migArrows.computeJsonData(migArrows.arrows);
  migArrows.updateSource();
  for (const c of migArrows.lineColors) {
    const id = `${migArrows.layerIdPrefix}_tails_${c}`;
    if (!map.getLayer(id)) {
      map.addLayer(
        {
          id,
          source: migArrows.sourceId,
          filter: ["all", ["==", "kind", "arrow-tail"], ["==", "color", c]],
          type: "line",
          paint: {
            "line-gradient": [
              "interpolate",
              ["linear"],
              ["line-progress"],
              0,
              "transparent",
              0.25,
              c,
            ],
            "line-width": ["get", "width"],
          },
        },
        migArrows.placeBelow || undefined
      );
    }
  }
  if (!map.getLayer(`${migArrows.layerIdPrefix}_heads`)) {
    map.addLayer(
      {
        id: `${migArrows.layerIdPrefix}_heads`,
        source: migArrows.sourceId,
        filter: ["==", "kind", "arrow-head"],
        type: "fill",
        paint: { "fill-color": ["get", "color"] },
      },
      migArrows.placeBelow || undefined
    );
  }
}

function renderLegend(html) {
  legendEl.innerHTML = html;
}

function branchFillColorExpr() {
  const expr = ["match", ["get", "id"]];
  for (const f of data.branchGeoJSON.features) {
    expr.push(f.properties.id, f.properties.fillColor);
  }
  expr.push("#cccccc");
  return expr;
}

function opacityExprForBranches(focusIds, selectedId) {
  if (selectedId) {
    return ["case", ["==", ["get", "id"], selectedId], 0.75, 0.12];
  }
  if (focusIds && focusIds.length) {
    return [
      "case",
      ["in", ["get", "id"], ["literal", focusIds]],
      0.7,
      0.1,
    ];
  }
  return 0.55;
}

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": ui.background },
      },
    ],
  },
  center: [119.9, 30.0],
  zoom: 6,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }));

function fitWuYue(duration = 0) {
  map.fitBounds(BOUNDS, {
    padding: { top: 56, bottom: 40, left: 40, right: 40 },
    duration,
    maxZoom: 8.5,
  });
}

function fitCityFrame(duration = 0) {
  map.fitBounds(CITY_FRAME, {
    padding: { top: 56, bottom: 48, left: 48, right: 48 },
    duration,
    maxZoom: 6.2,
  });
}

function fitMigration(bounds, toLngLat, fromLngLat) {
  if (!followMigration) return;
  let center = null;
  if (fromLngLat && toLngLat) {
    center = [(fromLngLat[0] + toLngLat[0]) / 2, (fromLngLat[1] + toLngLat[1]) / 2];
  } else if (toLngLat) {
    center = toLngLat;
  } else if (bounds) {
    center = [
      (bounds[0][0] + bounds[1][0]) / 2,
      (bounds[0][1] + bounds[1][1]) / 2,
    ];
  }
  if (!center) {
    map.easeTo({ center: [119.5, 31.2], zoom: FOLLOW_ZOOM, duration: 1000 });
    return;
  }
  // pan only — zoom locked so short/long hops feel the same
  map.easeTo({ center, zoom: FOLLOW_ZOOM, duration: 1000 });
}

function setChinaVisible(on) {
  const vis = on ? "visible" : "none";
  if (map.getLayer("china-fill")) map.setLayoutProperty("china-fill", "visibility", vis);
  if (map.getLayer("china-line")) map.setLayoutProperty("china-line", "visibility", vis);
}

function showCityLabels(activeId) {
  clearMarkers(labelMarkers);
  data.cities.forEach((c) => {
    const el = makeLabel(c.name, c.id === activeId ? "mig" : "");
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -8] })
      .setLngLat([c.lng, c.lat])
      .addTo(map);
    labelMarkers.push(marker);
  });
}

function showBranchLabels() {
  clearMarkers(labelMarkers);
  branchCentroids().forEach((b) => {
    const el = makeLabel(b.name, "branch-label");
    el.style.borderColor = b.fillColor;
    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([b.lng, b.lat])
      .addTo(map);
    labelMarkers.push(marker);
  });
}

function showMigEndLabels(bundle) {
  clearMarkers(migMarkers);
  if (!bundle.from || !bundle.to) return;
  const fromEl = makeLabel(bundle.fromName, "mig");
  const toEl = makeLabel(bundle.toName, "mig");
  migMarkers.push(
    new maplibregl.Marker({ element: fromEl, anchor: "bottom", offset: [0, -6] })
      .setLngLat(bundle.from)
      .addTo(map)
  );
  migMarkers.push(
    new maplibregl.Marker({ element: toEl, anchor: "bottom", offset: [0, -6] })
      .setLngLat(bundle.to)
      .addTo(map)
  );
  if (bundle.apex && bundle.mapLabel) {
    const apexEl = makeLabel(bundle.mapLabel, "mig arc-label");
    migMarkers.push(
      new maplibregl.Marker({ element: apexEl, anchor: "bottom", offset: [0, -10] })
        .setLngLat(bundle.apex)
        .addTo(map)
    );
  }
}

map.on("load", () => {
  map.addSource("china", { type: "geojson", data: chinaProvinces });
  map.addSource("branches", { type: "geojson", data: data.branchGeoJSON });
  map.addSource("city-outlines", {
    type: "geojson",
    data: data.cityOutlines || { type: "FeatureCollection", features: [] },
  });
  map.addSource("cities", { type: "geojson", data: citiesGeoJSON() });
  map.addSource("migration", {
    type: "geojson",
    lineMetrics: true,
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: "china-fill",
    type: "fill",
    source: "china",
    layout: { visibility: "none" },
    paint: { "fill-color": "#E7DFD2", "fill-opacity": 0.55 },
  });
  map.addLayer({
    id: "china-line",
    type: "line",
    source: "china",
    layout: { visibility: "none" },
    paint: { "line-color": "#C4B6A4", "line-width": 0.7, "line-opacity": 0.85 },
  });
  map.addLayer({
    id: "branches-fill",
    type: "fill",
    source: "branches",
    paint: { "fill-color": branchFillColorExpr(), "fill-opacity": 0.55 },
  });
  map.addLayer({
    id: "branches-line",
    type: "line",
    source: "branches",
    paint: { "line-color": "#FFFaf3", "line-width": 1 },
  });
  map.addLayer({
    id: "city-outline-fill",
    type: "fill",
    source: "city-outlines",
    paint: { "fill-color": ui.cityStroke, "fill-opacity": 0.22 },
    filter: ["==", ["get", "id"], ""],
  });
  map.addLayer({
    id: "city-outline-line",
    type: "line",
    source: "city-outlines",
    paint: { "line-color": ui.cityStroke, "line-width": 2.2 },
    filter: ["==", ["get", "id"], ""],
  });
  map.addLayer({
    id: "cities-circle",
    type: "circle",
    source: "cities",
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "id"], ""],
        7,
        5,
      ],
      "circle-color": ui.mutedInk,
      "circle-stroke-color": "#FFFaf3",
      "circle-stroke-width": 1.4,
      "circle-opacity": 0,
    },
  });
  // soft white halo under maplibre-arrows quadratic stroke
  map.addLayer({
    id: "migration-halo",
    type: "line",
    source: "migration",
    paint: {
      "line-color": "#FFF8F0",
      "line-width": 8,
      "line-opacity": 0.55,
      "line-blur": 0.4,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  ensureMigArrows();
  updateMigArc(null);

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  map.on("mousemove", "branches-fill", (e) => {
    if (mode !== "branch") return;
    map.getCanvas().style.cursor = "pointer";
    const f = e.features && e.features[0];
    if (!f) return;
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<strong>${f.properties.name}</strong><div style="margin-top:4px;font-size:12px;opacity:.85">${shortTip(f.properties)}</div>`
      )
      .addTo(map);
  });
  map.on("mouseleave", "branches-fill", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
  map.on("click", "branches-fill", (e) => {
    if (mode !== "branch") return;
    const f = e.features && e.features[0];
    if (f) selectBranch(f.properties.id);
  });
  map.on("click", "cities-circle", (e) => {
    if (mode !== "city" && mode !== "era") return;
    const f = e.features && e.features[0];
    if (f && mode === "city") pickCity(f.properties.id, true);
  });

  fitWuYue();
  buildBranchList();
  buildCityChips();
  buildEraTimeline();
  buildTimeAxisStatic();
  setMode("branch");
});

window.addEventListener("resize", () => {
  map.resize();
  if (mode === "city") {
    cityFrameReady = false;
    renderCityView({ camera: "frame" });
  } else fitWuYue();
});

function stopCityPlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  playBtn.classList.remove("playing");
  playBtn.textContent = "重新播放";
}

function stopEraPlay() {
  if (eraPlayTimer) {
    clearInterval(eraPlayTimer);
    eraPlayTimer = null;
  }
  eraPlay.classList.remove("playing");
  eraPlay.textContent = "自动讲述";
}

function applyBranchPaint() {
  if (!map.getLayer("branches-fill")) return;
  const focus = mode === "era" ? data.eras[eraIdx].focusBranchIds || [] : null;
  const selected = mode === "branch" ? selectedBranchId : null;
  map.setPaintProperty(
    "branches-fill",
    "fill-opacity",
    opacityExprForBranches(focus, selected)
  );
  map.setPaintProperty("branches-line", "line-color", [
    "case",
    ["==", ["get", "id"], selected || ""],
    ui.ink,
    "#FFFaf3",
  ]);
  map.setPaintProperty("branches-line", "line-width", [
    "case",
    ["==", ["get", "id"], selected || ""],
    2,
    1,
  ]);
}

function clearMigration() {
  if (map.getSource("migration")) {
    map.getSource("migration").setData({ type: "FeatureCollection", features: [] });
  }
  updateMigArc(null);
  clearMarkers(migMarkers);
}

function setCityLayersVisible(on) {
  map.setPaintProperty("cities-circle", "circle-opacity", on ? 1 : 0);
  if (!on) {
    map.setFilter("city-outline-fill", ["==", ["get", "id"], ""]);
    map.setFilter("city-outline-line", ["==", ["get", "id"], ""]);
    clearMigration();
    setChinaVisible(false);
  }
}

function restoreBranchColors() {
  map.setPaintProperty("branches-fill", "fill-color", branchFillColorExpr());
}

function renderBranchView() {
  hideTimeAxis();
  setChinaVisible(false);
  clearMigration();
  map.setPaintProperty("cities-circle", "circle-opacity", 0);
  map.setFilter("city-outline-fill", ["==", ["get", "id"], ""]);
  map.setFilter("city-outline-line", ["==", ["get", "id"], ""]);
  applyBranchPaint();
  showBranchLabels();
  renderLegend(
    data.branchGeoJSON.features
      .map(
        (f) =>
          `<div class="row"><i style="background:${f.properties.fillColor}"></i>${f.properties.name}</div>`
      )
      .join("")
  );
  fitWuYue(400);
}

function selectBranch(id) {
  if (selectedBranchId === id) {
    selectedBranchId = null;
    setStory({
      kicker: "六片分支",
      title: "点击地图或列表",
      year: "",
      body: "单击单选填色，再点取消。悬停只看片名与一句简介。",
    });
  } else {
    selectedBranchId = id;
    const f = data.branchGeoJSON.features.find((x) => x.properties.id === id);
    if (f) {
      setStory({
        kicker: "六片分支",
        title: f.properties.name,
        year: "",
        body: f.properties.summary || shortTip(f.properties),
      });
    }
  }
  [...branchList.children].forEach((li) => {
    li.classList.toggle("active", li.dataset.id === selectedBranchId);
  });
  applyBranchPaint();
}

function buildBranchList() {
  branchList.innerHTML = "";
  data.branchGeoJSON.features.forEach((f) => {
    const p = f.properties;
    const li = document.createElement("li");
    li.dataset.id = p.id;
    li.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;background:${p.fillColor}"></span>${p.name}<span style="display:block;margin-top:4px;font-size:.78rem;color:var(--muted);line-height:1.4">${shortTip(p)}</span>`;
    li.addEventListener("click", () => selectBranch(p.id));
    branchList.appendChild(li);
  });
}

function buildCityChips() {
  cityChips.innerHTML = "";
  data.cities.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "city-chip";
    btn.dataset.id = c.id;
    const tip = (c.blurb || c.shortTip || "").slice(0, 28);
    btn.innerHTML = `<span class="chip-name">${c.name}</span><span class="chip-branch">${c.branch}</span>${tip ? `<span class="chip-blurb">${tip}${ (c.blurb||c.shortTip||"").length>28 ? "…" : ""}</span>` : ""}`;
    btn.addEventListener("click", () => pickCity(c.id, true));
    cityChips.appendChild(btn);
  });
}

function renderCityView(opts = {}) {
  setChinaVisible(true);
  restoreBranchColors();
  map.setPaintProperty("branches-fill", "fill-opacity", 0.42);

  const outlineFilter = ["==", ["get", "id"], selectedCity.id];
  map.setFilter("city-outline-fill", outlineFilter);
  map.setFilter("city-outline-line", outlineFilter);

  map.setPaintProperty("cities-circle", "circle-opacity", 1);
  map.setPaintProperty("cities-circle", "circle-radius", [
    "case",
    ["==", ["get", "id"], selectedCity.id],
    8,
    4.5,
  ]);
  map.setPaintProperty("cities-circle", "circle-color", [
    "case",
    ["==", ["get", "id"], selectedCity.id],
    ui.accent,
    ui.mutedInk,
  ]);

  const ev = selectedCity.events[selectedEventIdx];
  const bundle = migrationBundle(ev, selectedCity.name);
  map.getSource("migration").setData(bundle.line);
  updateMigArc(bundle);
  showCityLabels(selectedCity.id);
  showMigEndLabels(bundle);

  setStory({
    kicker: "城市个案 · " + selectedCity.name,
    title: ev ? ev.title : selectedCity.name,
    year: ev ? `${yearText(ev.year)} · ${ev.era || ""}` : "",
    body: ev
      ? `${ev.mapLabel ? "迁徙：" + ev.mapLabel : "迁徙：" + bundle.fromName + " → " + bundle.toName}\n\n${ev.body}`
      : (selectedCity.blurb || ""),
  });

  renderLegend(
    `<div class="row"><i style="background:#C4B6A4"></i>中国省界（今界示意）</div>
     <div class="row"><i style="background:${ui.accent}"></i>${ev && ev.mapLabel ? ev.mapLabel : (bundle.fromName + " → " + bundle.toName)}</div>
     <div class="row"><i style="background:${ui.cityStroke}"></i>${selectedCity.name} 轮廓</div>`
  );
  renderTimeAxisCity();
  const camera = opts.camera || "none";
  if (camera === "frame" || (!cityFrameReady && camera !== "follow")) {
    fitCityFrame(camera === "frame" ? 600 : 0);
    cityFrameReady = true;
  } else if (camera === "follow" && followMigration) {
    fitMigration(bundle.bounds, bundle.to, bundle.from);
  }
  // default: no camera move when switching city/event
}

function syncCityPanel() {
  cityMeta.textContent = `今属 ${selectedCity.branch}`;
  [...cityChips.children].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.id === selectedCity.id);
  });
  eventList.innerHTML = "";
  selectedCity.events.forEach((ev, idx) => {
    const li = document.createElement("li");
    if (idx === selectedEventIdx) li.classList.add("active");
    const b = migrationBundle(ev, selectedCity.name);
    li.innerHTML = `<span class="year">${yearText(ev.year)} · ${ev.era || ""}</span><strong>${ev.title}</strong><span class="body" style="display:block;margin-top:4px;font-size:.78rem">${ev.mapLabel || (b.fromName + " → " + b.toName)}</span>`;
    li.addEventListener("click", () => {
      stopCityPlay();
      selectedEventIdx = idx;
      syncCityPanel();
      renderCityView({ camera: followMigration ? "follow" : "none" });
    });
    eventList.appendChild(li);
  });
}

function pickCity(id, autoplay) {
  stopCityPlay();
  selectedCity = data.cities.find((c) => c.id === id) || selectedCity;
  selectedEventIdx = 0;
  syncCityPanel();
  renderCityView({ camera: "none" });
  if (autoplay) startCityAutoplay();
}

function startCityAutoplay() {
  stopCityPlay();
  const maxIdx = Math.min(2, selectedCity.events.length - 1);
  selectedEventIdx = 0;
  syncCityPanel();
  renderCityView({ camera: "none" });
  playBtn.classList.add("playing");
  playBtn.textContent = "播放中…";
  let step = 0;
  playTimer = setInterval(() => {
    step += 1;
    if (step > maxIdx) {
      stopCityPlay();
      return;
    }
    selectedEventIdx = step;
    syncCityPanel();
    renderCityView({ camera: followMigration ? "follow" : "none" });
  }, 2400);
}

function buildEraTimeline() {
  eraTimeline.innerHTML = "";
  data.eras.forEach((era, i) => {
    const li = document.createElement("li");
    li.dataset.idx = String(i);
    li.innerHTML = `<span class="t-label">${era.label}</span><span class="t-year">${yearText(era.yearStart)} — ${yearText(era.yearEnd)}</span>`;
    li.addEventListener("click", () => {
      stopEraPlay();
      setEra(i);
    });
    eraTimeline.appendChild(li);
  });
}

function setEra(i) {
  eraIdx = Math.max(0, Math.min(data.eras.length - 1, i));
  [...eraTimeline.children].forEach((li, idx) => {
    li.classList.toggle("active", idx === eraIdx);
  });
  eraProgressBar.style.width = `${((eraIdx + 1) / data.eras.length) * 100}%`;
  renderEraView();
}

function renderEraView() {
  const era = data.eras[eraIdx];
  const focusIds = era.focusBranchIds || [];
  const focusCities = [...(era.focusCityIds || [])];

  setChinaVisible(false);
  clearMigration();

  setStory({
    kicker: "长时段",
    title: era.label,
    year: `${yearText(era.yearStart)} — ${yearText(era.yearEnd)}${era.dynastyLabel ? " · " + era.dynastyLabel : ""}`,
    body: era.summary,
  });

  restoreBranchColors();
  map.setPaintProperty(
    "branches-fill",
    "fill-opacity",
    opacityExprForBranches(focusIds, null)
  );
  map.setPaintProperty("branches-line", "line-color", [
    "case",
    ["in", ["get", "id"], ["literal", focusIds]],
    ui.ink,
    "#FFFaf3",
  ]);
  map.setPaintProperty("branches-line", "line-width", [
    "case",
    ["in", ["get", "id"], ["literal", focusIds]],
    1.6,
    0.7,
  ]);

  if (focusCities.length) {
    map.setFilter("city-outline-fill", [
      "in",
      ["get", "id"],
      ["literal", focusCities],
    ]);
    map.setFilter("city-outline-line", [
      "in",
      ["get", "id"],
      ["literal", focusCities],
    ]);
  } else {
    map.setFilter("city-outline-fill", ["==", ["get", "id"], ""]);
    map.setFilter("city-outline-line", ["==", ["get", "id"], ""]);
  }

  map.setPaintProperty("cities-circle", "circle-opacity", 1);
  map.setPaintProperty("cities-circle", "circle-radius", [
    "case",
    ["in", ["get", "id"], ["literal", focusCities]],
    7,
    3.5,
  ]);
  map.setPaintProperty("cities-circle", "circle-color", [
    "case",
    ["in", ["get", "id"], ["literal", focusCities]],
    ui.accent,
    "#C4B8A8",
  ]);

  clearMarkers(labelMarkers);
  data.cities.forEach((c) => {
    if (!focusCities.includes(c.id)) return;
    const el = makeLabel(c.name, "mig");
    labelMarkers.push(
      new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -8] })
        .setLngLat([c.lng, c.lat])
        .addTo(map)
    );
  });
  // also label focused branches
  branchCentroids()
    .filter((b) => focusIds.includes(b.id))
    .forEach((b) => {
      const el = makeLabel(b.name, "branch-label");
      labelMarkers.push(
        new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([b.lng, b.lat])
          .addTo(map)
      );
    });

  const names = data.branchGeoJSON.features
    .filter((f) => focusIds.includes(f.properties.id))
    .map((f) => f.properties.name);
  renderLegend(
    `<div class="row"><i style="background:${ui.accent}"></i>本段亮起：${names.join("、") || "—"}</div>`
  );
  renderTimeAxisEra();
  fitWuYue(400);
}

function startEraAutoplay() {
  stopEraPlay();
  eraPlay.classList.add("playing");
  eraPlay.textContent = "讲述中…";
  eraPlayTimer = setInterval(() => {
    if (eraIdx >= data.eras.length - 1) {
      stopEraPlay();
      return;
    }
    setEra(eraIdx + 1);
  }, 3200);
}

playBtn.addEventListener("click", () => {
  if (playTimer) stopCityPlay();
  else startCityAutoplay();
});
followMigrationEl.addEventListener("change", () => {
  followMigration = followMigrationEl.checked;
  if (mode === "city" && followMigration) {
    renderCityView({ camera: "follow" });
  } else if (mode === "city") {
    cityFrameReady = false;
    renderCityView({ camera: "frame" });
  }
});
eraPrev.addEventListener("click", () => {
  stopEraPlay();
  setEra(eraIdx - 1);
});
eraNext.addEventListener("click", () => {
  stopEraPlay();
  setEra(eraIdx + 1);
});
eraPlay.addEventListener("click", () => {
  if (eraPlayTimer) stopEraPlay();
  else startEraAutoplay();
});

window.addEventListener("keydown", (e) => {
  if (mode !== "era") return;
  if (e.code === "Space") {
    e.preventDefault();
    stopEraPlay();
    setEra(eraIdx + 1);
  }
});

function setMode(next) {
  stopCityPlay();
  stopEraPlay();
  mode = next;
  document.querySelectorAll("#layerTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layer === next);
  });
  document.getElementById("eraControls").classList.toggle("hidden", next !== "era");
  document.getElementById("branchControls").classList.toggle("hidden", next !== "branch");
  document.getElementById("cityControls").classList.toggle("hidden", next !== "city");

  const applyView = () => {
    if (mode !== next) return;
    if (!map.isStyleLoaded()) {
      map.once("idle", applyView);
      return;
    }
    restoreBranchColors();
    selectedBranchId = null;
    clearMarkers(labelMarkers);
    clearMarkers(migMarkers);

    if (next === "era") {
      setEra(eraIdx);
    } else if (next === "branch") {
      setStory({
        kicker: "六片分支",
        title: "点击地图或列表",
        year: "",
        body: "单击单选填色，再点取消。悬停只看片名与一句简介。",
      });
      [...branchList.children].forEach((li) => li.classList.remove("active"));
      renderBranchView();
    } else {
      selectedCity = data.cities.find((c) => c.id === "yangzhou") || data.cities[0];
      selectedEventIdx = 0;
      cityFrameReady = false;
      syncCityPanel();
      renderCityView({ camera: "frame" });
      startCityAutoplay();
    }
  };
  applyView();
}

document.getElementById("layerTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-layer]");
  if (btn) setMode(btn.dataset.layer);
});
