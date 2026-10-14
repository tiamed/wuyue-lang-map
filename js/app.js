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
  [116.65, 26.95],
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
const mapInfoEl = document.getElementById("mapInfo");
const branchList = document.getElementById("branchList");
const cityChips = document.getElementById("cityChips");
const cityMeta = document.getElementById("cityMeta");
const eventList = document.getElementById("eventList");
const playBtn = document.getElementById("playBtn");
const playProgressEl = document.getElementById("playProgress");
const cityPlayDock = document.getElementById("cityPlayDock");
const strataBarEl = document.getElementById("strataBar");
const followMigrationEl = document.getElementById("followMigration");
const showSubBranchesEl = document.getElementById("showSubBranches");
const storyKicker = document.getElementById("storyKicker");
const storyTitle = document.getElementById("storyTitle");
const storyYear = document.getElementById("storyYear");
const storyBody = document.getElementById("storyBody");
const storyExtra = document.getElementById("storyExtra");
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
let showSubBranches = false;
let cityIntroPlayed = false;
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

function setStory({ kicker, title, year, body, extraHtml }) {
  storyKicker.textContent = kicker || "";
  storyTitle.textContent = title || "";
  storyYear.textContent = year || "";
  storyBody.textContent = body || "";
  if (extraHtml) {
    storyExtra.innerHTML = extraHtml;
    storyExtra.classList.remove("hidden");
  } else {
    storyExtra.innerHTML = "";
    storyExtra.classList.add("hidden");
  }
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
      properties: {
        id: c.id,
        name: c.name,
        branch: c.branch,
        special: c.special || "",
      },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    })),
  };
}

function subBranchesGeoJSON() {
  const list = data.subBranches || [];
  return {
    type: "FeatureCollection",
    features: list.map((s) => ({
      type: "Feature",
      properties: {
        id: s.id,
        name: s.name,
        parent: s.parent,
        summary: s.summary || "",
        area: s.area || "",
        island: s.id === "sub-hangzhou",
      },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  };
}

function setSubBranchLayersVisible(on) {
  const vis = on ? "visible" : "none";
  ["sub-fill", "sub-line", "sub-branches-circle"].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  });
  // hangzhou point marker retired — island uses polygon fill
  if (map.getLayer("sub-branches-hangzhou")) {
    map.setLayoutProperty("sub-branches-hangzhou", "visibility", "none");
  }
}

function subFillColorExpr() {
  const expr = ["match", ["get", "id"]];
  const feats = (data.subBranchGeoJSON && data.subBranchGeoJSON.features) || [];
  for (const f of feats) {
    expr.push(f.properties.id, f.properties.fillColor || "#888888");
  }
  expr.push("#888888");
  return expr;
}

function applySubBranchMode() {
  if (!map.getLayer("sub-fill")) return;
  const inBranch = mode === "branch";
  const showSelected = inBranch && !!selectedBranchId;
  const showAll = inBranch && showSubBranches && !selectedBranchId;
  const on = showSelected || showAll;
  setSubBranchLayersVisible(on);
  const parentFilter = showSelected
    ? ["==", ["get", "parent"], selectedBranchId]
    : null;
  ["sub-fill", "sub-line", "sub-branches-circle"].forEach((id) => {
    if (map.getLayer(id)) map.setFilter(id, parentFilter);
  });
  // 看全部小片时淡化六片底；单选某片时仍用选中高亮，小面叠在上面
  if (inBranch && map.getLayer("branches-fill")) {
    map.setPaintProperty(
      "branches-fill",
      "fill-opacity",
      showAll ? 0.14 : opacityExprForBranches(null, selectedBranchId)
    );
  }
}

function subsVisible() {
  return mode === "branch" && (!!selectedBranchId || showSubBranches);
}

function islandFillColorExpr() {
  const expr = ["match", ["get", "id"]];
  const feats = (data.islandGeoJSON && data.islandGeoJSON.features) || [];
  for (const f of feats) {
    expr.push(f.properties.id, f.properties.fillColor || ui.accent);
  }
  expr.push(ui.accent);
  return expr;
}

function setIslandLayersVisible(on) {
  const vis = on ? "visible" : "none";
  ["islands-fill", "islands-line"].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  });
}

function subBranchesForParent(parentId) {
  return (data.subBranches || []).filter((s) => s.parent === parentId);
}

function subListHtml(parentId) {
  const subs = subBranchesForParent(parentId);
  if (!subs.length) return "";
  return (
    `<strong>片内小片</strong><ul class="sub-list">` +
    subs
      .map((s) => {
        const star = s.id === "sub-hangzhou" ? "（岛）" : "";
        return `<li><b>${s.name}${star}</b> — ${s.summary || s.area || ""}</li>`;
      })
      .join("") +
    `</ul>`
  );
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
  const empty = {
    line: { type: "FeatureCollection", features: [] },
    fromName: "",
    toName: cityName || "终点",
    bounds: null,
    from: null,
    to: null,
    control: null,
    apex: null,
    mapLabel: "",
    showArrow: false,
  };
  if (!ev || !ev.from || !ev.to) return empty;
  const fromLng = ev.from[1];
  const fromLat = ev.from[0];
  const toLng = ev.to[1];
  const toLat = ev.to[0];
  const samePoint =
    Math.abs(fromLng - toLng) < 1e-5 && Math.abs(fromLat - toLat) < 1e-5;
  // local evolution / explicit flag — never feed degenerate arcs to the plugin
  const showArrow = ev.showArrow !== false && !samePoint;
  let fromName = ev.fromName || "起点";
  let toName = ev.toName || cityName || "终点";
  if (ev.mapLabel && ev.mapLabel.includes("→")) {
    const parts = ev.mapLabel.split("→").map((s) => s.trim());
    if (parts[0]) fromName = parts[0];
    if (parts[1]) toName = parts[1];
  }
  if (!showArrow) {
    return {
      ...empty,
      fromName,
      toName,
      mapLabel: ev.mapLabel || "",
      showArrow: false,
    };
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
    showArrow: true,
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
  // map already past "load" — source only; we own solid (non-gradient) layers
  if (!map.getSource(migArrows.sourceId)) {
    migArrows.addSource();
  }
  clearMigArc();
}

function clearMigArc() {
  ensureMigArrows();
  if (!migArrows) return;
  migArrows.arrows = [];
  migArrows.jsonData = [];
  migArrows.updateSource();
}

function ensureMigArcLayers(color) {
  const prefix = migArrows.layerIdPrefix;
  const tailId = `${prefix}_tails_${color}`;
  // drop any leftover white/gradient tails from older builds
  for (const c of [...migArrows.lineColors]) {
    const id = `${prefix}_tails_${c}`;
    if (c !== color && map.getLayer(id)) map.removeLayer(id);
  }
  migArrows.lineColors = [color];
  if (map.getLayer(tailId)) {
    // solid stroke — no transparent→color gradient (reads as “weird fade”)
    try {
      map.setPaintProperty(tailId, "line-gradient", undefined);
    } catch (_) {}
    map.setPaintProperty(tailId, "line-color", color);
    map.setPaintProperty(tailId, "line-width", ["get", "width"]);
    map.setPaintProperty(tailId, "line-opacity", 0.95);
  } else {
    map.addLayer(
      {
        id: tailId,
        source: migArrows.sourceId,
        filter: ["all", ["==", "kind", "arrow-tail"], ["==", "color", color]],
        type: "line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": color,
          "line-width": ["get", "width"],
          "line-opacity": 0.95,
        },
      },
      migArrows.placeBelow || undefined
    );
  }
  const headId = `${prefix}_heads`;
  if (!map.getLayer(headId)) {
    map.addLayer(
      {
        id: headId,
        source: migArrows.sourceId,
        filter: ["==", "kind", "arrow-head"],
        type: "fill",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.95 },
      },
      migArrows.placeBelow || undefined
    );
  }
}

function updateMigArc(bundle) {
  ensureMigArrows();
  if (!migArrows) return;
  // always wipe previous geometry first (city switch / local events)
  clearMigArc();
  if (!bundle || !bundle.showArrow || !bundle.from || !bundle.to || !bundle.control) {
    return;
  }
  const pts = [bundle.from, bundle.to, bundle.control];
  const color = ui.accent;
  migArrows.arrows = [
    {
      layout: "quadratic",
      lineColor: color,
      lineWidth: 3.8,
      points: pts,
      headScale: [1.45, 1.75],
    },
  ];
  migArrows.jsonData = migArrows.computeJsonData(migArrows.arrows);
  ensureMigArcLayers(color);
  migArrows.updateSource();
}

function renderLegend(html) {
  legendEl.innerHTML = html;
}

function cityAttrTag(c) {
  if (!c) return "";
  if (c.special === "dialectIsland") return "方言岛";
  if (c.special === "exitedWu") return "已退出吴语";
  const b = c.branch || "";
  return b.split("·")[0] || b;
}

function setMapInfo({ kicker, title, sub, onClick }) {
  if (!mapInfoEl) return;
  if (!title) {
    mapInfoEl.classList.remove("visible");
    mapInfoEl.innerHTML = "";
    mapInfoEl.onclick = null;
    return;
  }
  mapInfoEl.classList.add("visible");
  mapInfoEl.innerHTML =
    (kicker ? `<div class="mi-kicker">${kicker}</div>` : "") +
    `<div class="mi-title">${title}</div>` +
    (sub ? `<div class="mi-sub">${sub}</div>` : "");
  mapInfoEl.onclick = typeof onClick === "function" ? onClick : null;
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
  if (showSubBranches && !selectedBranchId) {
    // 勾选看全部小片：小片文字标签
    (data.subBranches || []).forEach((s) => {
      const short =
        s.name.replace(/小片|（.*）/g, "").trim() || s.name;
      const el = makeLabel(short, "sub-label");
      labelMarkers.push(
        new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([s.lng, s.lat])
          .addTo(map)
      );
    });
    return;
  }
  if (selectedBranchId) {
    // 选中母片：片标签 + 该片小片标签
    branchCentroids()
      .filter((b) => b.id === selectedBranchId)
      .forEach((b) => {
        const el = makeLabel(b.name, "branch-label");
        el.style.borderColor = b.fillColor;
        labelMarkers.push(
          new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([b.lng, b.lat])
            .addTo(map)
        );
      });
    (data.subBranches || [])
      .filter((s) => s.parent === selectedBranchId)
      .forEach((s) => {
        const short =
          s.name.replace(/小片|（.*）/g, "").trim() || s.name;
        const el = makeLabel(short, "sub-label");
        labelMarkers.push(
          new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([s.lng, s.lat])
            .addTo(map)
        );
      });
    return;
  }
  branchCentroids().forEach((b) => {
    const el = makeLabel(b.name, "branch-label");
    el.style.borderColor = b.fillColor;
    labelMarkers.push(
      new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([b.lng, b.lat])
        .addTo(map)
    );
  });
}

function showMigEndLabels(bundle) {
  clearMarkers(migMarkers);
  if (!bundle || !bundle.showArrow || !bundle.from || !bundle.to) return;
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
  map.addSource("sub-polys", {
    type: "geojson",
    data: data.subBranchGeoJSON || { type: "FeatureCollection", features: [] },
  });
  map.addSource("sub-branches", { type: "geojson", data: subBranchesGeoJSON() });
  map.addLayer({
    id: "sub-fill",
    type: "fill",
    source: "sub-polys",
    layout: { visibility: "none" },
    paint: {
      "fill-color": subFillColorExpr(),
      "fill-opacity": 0.48,
    },
  });
  map.addLayer({
    id: "sub-line",
    type: "line",
    source: "sub-polys",
    layout: { visibility: "none" },
    paint: {
      "line-color": "#FFFaf3",
      "line-width": 1.1,
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "sub-branches-circle",
    type: "circle",
    source: "sub-branches",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": 3.5,
      "circle-color": ui.ink,
      "circle-opacity": 0.65,
      "circle-stroke-color": "#FFFaf3",
      "circle-stroke-width": 1.1,
    },
  });
  map.addSource("islands", {
    type: "geojson",
    data: data.islandGeoJSON || { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "islands-fill",
    type: "fill",
    source: "islands",
    paint: {
      "fill-color": islandFillColorExpr(),
      "fill-opacity": [
        "case",
        ["==", ["get", "emphasis"], true],
        0.42,
        0.28,
      ],
    },
  });
  map.addLayer({
    id: "islands-line",
    type: "line",
    source: "islands",
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "emphasis"], true],
        ui.accent,
        "#6E6A64",
      ],
      "line-width": [
        "case",
        ["==", ["get", "emphasis"], true],
        2,
        1.2,
      ],
      "line-dasharray": [1.8, 1.4],
      "line-opacity": 0.9,
    },
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
      "line-width": 6,
      "line-opacity": 0.45,
      "line-blur": 0.6,
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
  const bindSubHover = (layerId) => {
    map.on("mousemove", layerId, (e) => {
      if (!subsVisible()) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features && e.features[0];
      if (!f) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${f.properties.name}</strong><div style="margin-top:4px;font-size:12px;opacity:.85">${f.properties.summary || f.properties.area || ""}</div>`
        )
        .addTo(map);
    });
    map.on("mouseleave", layerId, () => {
      if (mode !== "branch") return;
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", layerId, (e) => {
      if (!subsVisible()) return;
      const f = e.features && e.features[0];
      if (!f || !f.properties.parent) return;
      // 已选该母片时再点小面不取消选中
      if (selectedBranchId !== f.properties.parent) {
        selectBranch(f.properties.parent);
      }
    });
  };
  bindSubHover("sub-fill");
  bindSubHover("sub-branches-circle");
  map.on("mousemove", "islands-fill", (e) => {
    if (mode !== "branch") return;
    map.getCanvas().style.cursor = "pointer";
    const f = e.features && e.features[0];
    if (!f) return;
    const isl = (data.dialectIslands || []).find((x) => x.id === f.properties.id);
    const strataLine = isl && isl.strata && isl.strata.length
      ? `<div style="margin-top:4px;font-size:11px;opacity:.8">层次：${isl.strata.map((s) => s.title || s.id).join(" → ")}</div>`
      : "";
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<strong>${f.properties.name}</strong><div style="margin-top:4px;font-size:12px;opacity:.85">${f.properties.summary || f.properties.kind || ""}</div>${strataLine}`
      )
      .addTo(map);
  });
  map.on("mouseleave", "islands-fill", () => {
    if (mode !== "branch") return;
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
  map.on("click", "cities-circle", (e) => {
    if (mode !== "city" && mode !== "era") return;
    const f = e.features && e.features[0];
    if (f && mode === "city") pickCity(f.properties.id);
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

function updatePlayChrome() {
  const n = (selectedCity && selectedCity.events) ? selectedCity.events.length : 0;
  const cur = n ? selectedEventIdx + 1 : 0;
  if (playProgressEl) {
    playProgressEl.textContent = n ? `第 ${cur} / ${n} 事` : "";
  }
  if (!playTimer) {
    playBtn.classList.remove("playing");
    playBtn.textContent = "播放";
  } else {
    playBtn.classList.add("playing");
    playBtn.textContent = "暂停";
  }
}

function stopCityPlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  updatePlayChrome();
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
  applySubBranchMode();
  setIslandLayersVisible(true);
  map.setPaintProperty("cities-circle", "circle-opacity", 0);
  map.setFilter("city-outline-fill", ["==", ["get", "id"], ""]);
  map.setFilter("city-outline-line", ["==", ["get", "id"], ""]);
  applyBranchPaint();
  showBranchLabels();
  const note = data.partitionNote
    ? `<div class="row" style="margin-top:4px;opacity:.85">${data.partitionNote.slice(0, 42)}…</div>`
    : "";
  renderLegend(
    data.branchGeoJSON.features
      .map(
        (f) =>
          `<div class="row"><i style="background:${f.properties.fillColor}"></i>${f.properties.name}</div>`
      )
      .join("") +
      (selectedBranchId || showSubBranches
        ? `<div class="row"><i style="background:#4A6B7C"></i>${selectedBranchId ? "当前片·小片轮廓" : "片内小片色块（示意）"}</div>`
        : "") +
      (!selectedBranchId
        ? `<div class="row"><i style="background:#8B3A3A;border:1px dashed ${ui.accent}"></i>方言岛色块（虚线边）</div>
      <div class="row"><i style="background:#72B7B2;border:1px dashed #6E6A64"></i>嵌岛示意</div>`
        : "") +
      note
  );
  if (selectedBranchId) {
    const f = data.branchGeoJSON.features.find((x) => x.properties.id === selectedBranchId);
    if (f) {
      setMapInfo({
        kicker: "六片分支",
        title: f.properties.name,
        sub: shortTip(f.properties),
        onClick: () => {
          const br = (data.branches || []).find((b) => b.id === selectedBranchId);
          const strataSum = br && br.strataSummary
            ? `<strong>层次摘要</strong><div style="margin-top:4px">${br.strataSummary}</div>`
            : "";
          setStory({
            kicker: "六片分支",
            title: f.properties.name,
            year: "",
            body: f.properties.summary || shortTip(f.properties),
            extraHtml: [strataSum, subListHtml(selectedBranchId)].filter(Boolean).join('<div style="height:8px"></div>'),
          });
        },
      });
    }
  } else {
    setMapInfo({
      kicker: "六片分支",
      title: showSubBranches ? "片内小片示意" : "吴语六片",
      sub: "点地图或列表查看一片",
    });
  }
  fitWuYue(400);
}

function selectBranch(id) {
  if (selectedBranchId === id) {
    selectedBranchId = null;
    setStory({
      kicker: "六片分支",
      title: "点击地图或列表",
      year: "",
      body: "单击单选填色，再点取消。勾选「看小片色块」叠县市示意面；虚线面为方言岛。",
    });
    setMapInfo({
      kicker: "六片分支",
      title: showSubBranches ? "片内小片示意" : "吴语六片",
      sub: "点地图或列表查看一片",
    });
  } else {
    selectedBranchId = id;
    const f = data.branchGeoJSON.features.find((x) => x.properties.id === id);
    if (f) {
      const br = (data.branches || []).find((b) => b.id === id);
      const strataSum = br && br.strataSummary
        ? `<strong>层次摘要</strong><div style="margin-top:4px">${br.strataSummary}</div>`
        : "";
      const extras = [strataSum, subListHtml(id)].filter(Boolean).join('<div style="height:8px"></div>');
      setStory({
        kicker: "六片分支",
        title: f.properties.name,
        year: "",
        body: f.properties.summary || shortTip(f.properties),
        extraHtml: extras,
      });
      setMapInfo({
        kicker: "六片分支",
        title: f.properties.name,
        sub: (br && br.strataSummary)
          ? br.strataSummary.split(/[。；;]/)[0]
          : shortTip(f.properties),
        onClick: () => {
          const br2 = (data.branches || []).find((b) => b.id === id);
          const strataSum2 = br2 && br2.strataSummary
            ? `<strong>层次摘要</strong><div style="margin-top:4px">${br2.strataSummary}</div>`
            : "";
          setStory({
            kicker: "六片分支",
            title: f.properties.name,
            year: "",
            body: f.properties.summary || shortTip(f.properties),
            extraHtml: [strataSum2, subListHtml(id)].filter(Boolean).join('<div style="height:8px"></div>'),
          });
        },
      });
    }
  }
  [...branchList.children].forEach((li) => {
    li.classList.toggle("active", li.dataset.id === selectedBranchId);
  });
  applyBranchPaint();
  if (mode === "branch") {
    applySubBranchMode();
    showBranchLabels();
  }
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
    btn.className =
      "city-chip" +
      (c.special === "dialectIsland"
        ? " special-island"
        : c.special === "exitedWu"
          ? " special-exit"
          : "");
    btn.dataset.id = c.id;
    const tag = cityAttrTag(c);
    btn.textContent = tag ? `${c.name} · ${tag}` : c.name;
    btn.title = c.shortTip || c.blurb || c.name;
    btn.addEventListener("click", () => pickCity(c.id));
    cityChips.appendChild(btn);
  });
}

function renderCityView(opts = {}) {
  setSubBranchLayersVisible(false);
  setIslandLayersVisible(false);
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
  // wipe previous city arrow before computing the next
  clearMigration();
  const bundle = migrationBundle(ev, selectedCity.name);
  map.getSource("migration").setData(bundle.line);
  updateMigArc(bundle);
  showCityLabels(selectedCity.id);
  showMigEndLabels(bundle);

  const migLine =
    bundle.showArrow && (ev.mapLabel || (bundle.fromName + " → " + bundle.toName));
  const attr = cityAttrTag(selectedCity);
  const sid = ev && ev.stratumId;
  const stratum = ((selectedCity.strata || []).find((s) => s.id === sid)) || null;
  const stratumBlock = stratum
    ? `<strong>层次 · ${stratum.title}</strong><div style="margin-top:4px">${stratum.body || stratumTypeLabel(sid)}</div>`
    : "";
  const blurbBlock = selectedCity.blurb
    ? `<strong>概览</strong><div style="margin-top:4px">${selectedCity.blurb}</div>`
    : "";
  const islandExtra = selectedCity.islandNote
    ? `<strong>${attr || "特记"}</strong><div style="margin-top:4px">${selectedCity.islandNote}</div>`
    : "";
  const extras = [stratumBlock, blurbBlock, islandExtra].filter(Boolean).join('<div style="height:8px"></div>');
  setStory({
    kicker: "城市个案 · " + selectedCity.name + (attr ? " · " + attr : ""),
    title: ev ? ev.title : selectedCity.name,
    year: ev
      ? `${yearText(ev.year)} · ${ev.era || ""}${stratum ? " · " + stratum.title : ""}`
      : "",
    body: ev
      ? `${migLine ? "迁徙：" + migLine + "\n\n" : ""}${ev.body}`
      : (selectedCity.blurb || ""),
    extraHtml: extras,
  });
  setMapInfo({
    kicker: "城市个案",
    title: selectedCity.name + (attr ? " · " + attr : ""),
    sub: ev
      ? `${yearText(ev.year)} · ${ev.title}${stratum ? " · " + stratum.title : ""}`
      : (selectedCity.shortTip || ""),
    onClick: () => {
      syncCityPanel();
    },
  });

  const strataLegend = (selectedCity.strata || [])
    .map((s) => `<div class="row"><i style="background:${stratumColor(s.id)}"></i>${s.title}</div>`)
    .join("");
  renderLegend(
    `<div class="row"><i style="background:#C4B6A4"></i>中国省界（今界示意）</div>
     ${bundle.showArrow ? `<div class="row"><i style="background:${ui.accent}"></i>${migLine}</div>` : `<div class="row"><i style="background:${ui.mutedInk}"></i>本地演变（无迁徙弧）</div>`}
     <div class="row"><i style="background:${ui.cityStroke}"></i>${selectedCity.name} 轮廓</div>` +
      (strataLegend ? `<div class="row" style="margin-top:4px;opacity:.85">层次（底→顶）</div>${strataLegend}` : "")
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


function stratumColor(id) {
  const t = (data.stratumTypes || []).find((x) => x.id === id);
  return (t && t.color) || "#8B8B8B";
}

function stratumTypeLabel(id) {
  const t = (data.stratumTypes || []).find((x) => x.id === id);
  return (t && t.label) || id || "";
}

function activeStratumId() {
  const ev = selectedCity && selectedCity.events && selectedCity.events[selectedEventIdx];
  return (ev && ev.stratumId) || null;
}

function renderStrataBar() {
  if (!strataBarEl) return;
  strataBarEl.innerHTML = "";
  const strata = (selectedCity && selectedCity.strata) || [];
  if (!strata.length) {
    strataBarEl.innerHTML = '<span class="meta" style="font-size:.75rem">本城暂无层次数据</span>';
    return;
  }
  const active = activeStratumId();
  strata.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "strata-chip" + (active === s.id ? " active" : active ? " dim" : "");
    btn.dataset.id = s.id;
    btn.setAttribute("role", "listitem");
    btn.title = s.body || s.title;
    btn.innerHTML = `<i style="background:${stratumColor(s.id)}"></i><span>${s.title}</span>`;
    btn.addEventListener("click", () => {
      stopCityPlay();
      const idx = selectedCity.events.findIndex((ev) => ev.stratumId === s.id);
      if (idx >= 0) {
        selectedEventIdx = idx;
        syncCityPanel();
        renderCityView({ camera: followMigration ? "follow" : "none" });
      } else {
        setStory({
          kicker: "层次 · " + selectedCity.name,
          title: s.title,
          year: s.approxYear != null ? yearText(s.approxYear) : "",
          body: s.body || "",
          extraHtml: `<strong>${stratumTypeLabel(s.id)}</strong>`,
        });
        [...strataBarEl.querySelectorAll(".strata-chip")].forEach((el) => {
          el.classList.toggle("active", el.dataset.id === s.id);
          el.classList.toggle("dim", el.dataset.id !== s.id);
        });
        setMapInfo({
          kicker: "层次",
          title: selectedCity.name + " · " + s.title,
          sub: stratumTypeLabel(s.id),
        });
      }
    });
    strataBarEl.appendChild(btn);
  });
}

function syncCityPanel() {
  const attr = cityAttrTag(selectedCity);
  cityMeta.textContent = attr
    ? `${attr} · ${selectedCity.branch}`
    : `今属 ${selectedCity.branch}`;
  [...cityChips.children].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.id === selectedCity.id);
  });
  eventList.innerHTML = "";
  selectedCity.events.forEach((ev, idx) => {
    const li = document.createElement("li");
    if (idx === selectedEventIdx) li.classList.add("active");
    li.innerHTML = `<span class="year">${yearText(ev.year)}</span> · <strong>${ev.title}</strong>`;
    li.addEventListener("click", () => {
      stopCityPlay();
      selectedEventIdx = idx;
      syncCityPanel();
      renderCityView({ camera: followMigration ? "follow" : "none" });
    });
    eventList.appendChild(li);
  });
  updatePlayChrome();
  renderStrataBar();
}

function pickCity(id) {
  stopCityPlay();
  clearMigration();
  selectedCity = data.cities.find((c) => c.id === id) || selectedCity;
  selectedEventIdx = 0;
  syncCityPanel();
  renderCityView({ camera: "none" });
}

function startCityAutoplay() {
  stopCityPlay();
  const lastIdx = selectedCity.events.length - 1;
  if (lastIdx < 0) return;
  selectedEventIdx = 0;
  syncCityPanel();
  renderCityView({ camera: "none" });
  if (lastIdx === 0) {
    updatePlayChrome();
    return;
  }
  let step = 0;
  playTimer = setInterval(() => {
    step += 1;
    if (step > lastIdx) {
      selectedEventIdx = lastIdx;
      syncCityPanel();
      stopCityPlay();
      return;
    }
    selectedEventIdx = step;
    syncCityPanel();
    renderCityView({ camera: followMigration ? "follow" : "none" });
    updatePlayChrome();
  }, 2400);
  updatePlayChrome();
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

  setSubBranchLayersVisible(false);
  setIslandLayersVisible(false);
  setChinaVisible(false);
  clearMigration();

  const dist = era.distribution
    ? `<strong>分布</strong><div style="margin-top:4px">${era.distribution}</div>`
    : "";
  const strataBlurb = era.strataBlurb
    ? `<strong>层次</strong><div style="margin-top:4px">${era.strataBlurb}</div>`
    : "";
  setStory({
    kicker: "长时段",
    title: era.label,
    year: `${yearText(era.yearStart)} — ${yearText(era.yearEnd)}${era.dynastyLabel ? " · " + era.dynastyLabel : ""}`,
    body: era.background || era.summary,
    extraHtml: [strataBlurb, dist].filter(Boolean).join('<div style="height:8px"></div>'),
  });
  const distOne = (era.distribution || "").split(/[。；;]/)[0] || "";
  const focusLabels = (era.stratumFocus || []).map(stratumTypeLabel).filter(Boolean);
  setMapInfo({
    kicker: "长时段",
    title: era.label + (era.dynastyLabel ? " · " + era.dynastyLabel : ""),
    sub: (focusLabels.length ? "层次：" + focusLabels.join(" · ") + " · " : "") +
      (distOne || shortTip({ summary: era.summary || era.background || "" })),
    onClick: () => setEra(eraIdx),
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


showSubBranchesEl.addEventListener("change", () => {
  showSubBranches = showSubBranchesEl.checked;
  if (mode === "branch") {
    applySubBranchMode();
    showBranchLabels();
    renderBranchView();
  }
});
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
  if (cityPlayDock) cityPlayDock.classList.toggle("hidden", next !== "city");

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
      // 仅第一次进城市个案自动讲述；之后换城/进层都改手动播放
      if (!cityIntroPlayed) {
        cityIntroPlayed = true;
        startCityAutoplay();
      }
    }
  };
  applyView();
}

document.getElementById("layerTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-layer]");
  if (btn) setMode(btn.dataset.layer);
});
