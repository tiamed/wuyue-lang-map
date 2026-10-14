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
const storyKicker = document.getElementById("storyKicker");
const storyTitle = document.getElementById("storyTitle");
const storyYear = document.getElementById("storyYear");
const storyBody = document.getElementById("storyBody");
const eraTimeline = document.getElementById("eraTimeline");
const eraProgressBar = document.getElementById("eraProgressBar");
const eraPrev = document.getElementById("eraPrev");
const eraNext = document.getElementById("eraNext");
const eraPlay = document.getElementById("eraPlay");

let mode = "branch";
let selectedBranchId = null;
let selectedCity = data.cities.find((c) => c.id === "yangzhou") || data.cities[0];
let selectedEventIdx = 0;
let eraIdx = 4;
let playTimer = null;
let eraPlayTimer = null;
const labelMarkers = [];
const migMarkers = [];

function yearText(y) {
  return y < 0 ? "前" + Math.abs(y) + "年" : y + "年";
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

function migrationBundle(ev, cityName) {
  if (!ev || !ev.from || !ev.to) {
    return {
      line: { type: "FeatureCollection", features: [] },
      fromName: "",
      toName: cityName || "终点",
      bounds: null,
      from: null,
      to: null,
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
  return {
    fromName,
    toName,
    from: [fromLng, fromLat],
    to: [toLng, toLat],
    bounds: [
      [Math.min(fromLng, toLng), Math.min(fromLat, toLat)],
      [Math.max(fromLng, toLng), Math.max(fromLat, toLat)],
    ],
    line: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { fromName, toName },
          geometry: {
            type: "LineString",
            coordinates: [
              [fromLng, fromLat],
              [toLng, toLat],
            ],
          },
        },
      ],
    },
  };
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

function fitMigration(bounds, toLngLat) {
  if (!bounds) {
    fitWuYue(400);
    return;
  }
  // pad north so Yangzhou / northern tip isn't clipped
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const padLat = Math.max(0.8, (maxLat - minLat) * 0.25);
  const padLng = Math.max(0.8, (maxLng - minLng) * 0.2);
  let b = [
    [minLng - padLng, minLat - padLat * 0.35],
    [maxLng + padLng, maxLat + padLat * 1.15],
  ];
  // always include Wu-Yue northern edge a bit when destination is Yangzhou-ish
  if (toLngLat) {
    b[0][0] = Math.min(b[0][0], toLngLat[0] - 0.6);
    b[0][1] = Math.min(b[0][1], toLngLat[1] - 0.5);
    b[1][0] = Math.max(b[1][0], toLngLat[0] + 0.6);
    b[1][1] = Math.max(b[1][1], toLngLat[1] + 0.9);
  }
  map.fitBounds(b, {
    padding: { top: 96, bottom: 64, left: 56, right: 56 },
    duration: 500,
    maxZoom: 6.0,
    minZoom: 3.6,
  });
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
    data: { type: "FeatureCollection", features: [] },
  });

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = ui.accent;
  ctx.beginPath();
  ctx.moveTo(8, 20);
  ctx.lineTo(size - 4, size / 2);
  ctx.lineTo(8, size - 20);
  ctx.lineTo(18, size / 2);
  ctx.closePath();
  ctx.fill();
  map.addImage("mig-arrow", ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });

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
  map.addLayer({
    id: "migration-line",
    type: "line",
    source: "migration",
    paint: { "line-color": ui.accent, "line-width": 4.5, "line-opacity": 0.92 },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "migration-arrow",
    type: "symbol",
    source: "migration",
    layout: {
      "symbol-placement": "line-center",
      "icon-image": "mig-arrow",
      "icon-size": 0.6,
      "icon-allow-overlap": true,
      "icon-rotation-alignment": "map",
    },
  });

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
  setMode("branch");
});

window.addEventListener("resize", () => {
  map.resize();
  if (mode === "city") renderCityView();
  else fitWuYue();
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
  map.getSource("migration").setData({ type: "FeatureCollection", features: [] });
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

function renderCityView() {
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
  fitMigration(bundle.bounds, bundle.to);
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
      renderCityView();
    });
    eventList.appendChild(li);
  });
}

function pickCity(id, autoplay) {
  stopCityPlay();
  selectedCity = data.cities.find((c) => c.id === id) || selectedCity;
  selectedEventIdx = 0;
  syncCityPanel();
  renderCityView();
  if (autoplay) startCityAutoplay();
}

function startCityAutoplay() {
  stopCityPlay();
  const maxIdx = Math.min(2, selectedCity.events.length - 1);
  selectedEventIdx = 0;
  syncCityPanel();
  renderCityView();
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
    renderCityView();
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
    year: `${yearText(era.yearStart)} — ${yearText(era.yearEnd)}`,
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

  if (!map.isStyleLoaded()) return;
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
    syncCityPanel();
    renderCityView();
    startCityAutoplay();
  }
}

document.getElementById("layerTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-layer]");
  if (btn) setMode(btn.dataset.layer);
});
