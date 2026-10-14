const data = await fetch("data/wuyue-map-data.json").then((r) => r.json());

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
const citySelect = document.getElementById("citySelect");
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
let cityEnterPlayed = false;

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

function migrationGeoJSON(ev) {
  if (!ev || !ev.from || !ev.to) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [ev.from[1], ev.from[0]],
            [ev.to[1], ev.to[0]],
          ],
        },
      },
    ],
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
    return [
      "case",
      ["==", ["get", "id"], selectedId],
      0.75,
      0.12,
    ];
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

function fitWuYue() {
  map.fitBounds(BOUNDS, { padding: 48, duration: 0, maxZoom: 8.5 });
}

map.on("load", () => {
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

  map.addLayer({
    id: "branches-fill",
    type: "fill",
    source: "branches",
    paint: {
      "fill-color": branchFillColorExpr(),
      "fill-opacity": 0.55,
    },
  });
  map.addLayer({
    id: "branches-line",
    type: "line",
    source: "branches",
    paint: {
      "line-color": "#FFFaf3",
      "line-width": 1,
    },
  });
  map.addLayer({
    id: "city-outline-fill",
    type: "fill",
    source: "city-outlines",
    paint: {
      "fill-color": ui.cityStroke,
      "fill-opacity": 0.2,
    },
    filter: ["==", ["get", "id"], ""],
  });
  map.addLayer({
    id: "city-outline-line",
    type: "line",
    source: "city-outlines",
    paint: {
      "line-color": ui.cityStroke,
      "line-width": 2,
    },
    filter: ["==", ["get", "id"], ""],
  });
  map.addLayer({
    id: "cities-circle",
    type: "circle",
    source: "cities",
    paint: {
      "circle-radius": 4,
      "circle-color": ui.mutedInk,
      "circle-stroke-color": "#FFFaf3",
      "circle-stroke-width": 1.2,
      "circle-opacity": 0,
    },
  });
  map.addLayer({
    id: "migration-line",
    type: "line",
    source: "migration",
    paint: {
      "line-color": ui.accent,
      "line-width": 3,
      "line-opacity": 0.9,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // hover tip for branches
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
  });
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
    if (mode !== "city") return;
    const f = e.features && e.features[0];
    if (f) pickCity(f.properties.id, false);
  });

  fitWuYue();
  buildBranchList();
  buildEraTimeline();
  setMode("branch");
});

window.addEventListener("resize", () => {
  map.resize();
  fitWuYue();
});

function stopCityPlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  playBtn.classList.remove("playing");
  playBtn.textContent = "自动播放前 3 事";
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
  const focus =
    mode === "era" ? data.eras[eraIdx].focusBranchIds || [] : null;
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

function setCityLayersVisible(on) {
  const o = on ? 1 : 0;
  map.setPaintProperty("cities-circle", "circle-opacity", on ? 1 : 0);
  if (!on) {
    map.setFilter("city-outline-fill", ["==", ["get", "id"], ""]);
    map.setFilter("city-outline-line", ["==", ["get", "id"], ""]);
    map.getSource("migration").setData({ type: "FeatureCollection", features: [] });
  }
}

function renderBranchView() {
  setCityLayersVisible(false);
  applyBranchPaint();
  renderLegend(
    data.branchGeoJSON.features
      .map(
        (f) =>
          `<div class="row"><i style="background:${f.properties.fillColor}"></i>${f.properties.name}</div>`
      )
      .join("")
  );
  fitWuYue();
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

function renderCityView() {
  applyBranchPaint();
  map.setPaintProperty("branches-fill", "fill-opacity", 0.18);
  map.setPaintProperty("branches-fill", "fill-color", ui.water);

  const outlineFilter = ["==", ["get", "id"], selectedCity.id];
  map.setFilter("city-outline-fill", outlineFilter);
  map.setFilter("city-outline-line", outlineFilter);

  map.setPaintProperty("cities-circle", "circle-opacity", 1);
  map.setPaintProperty("cities-circle", "circle-radius", [
    "case",
    ["==", ["get", "id"], selectedCity.id],
    7,
    4,
  ]);
  map.setPaintProperty("cities-circle", "circle-color", [
    "case",
    ["==", ["get", "id"], selectedCity.id],
    ui.accent,
    ui.mutedInk,
  ]);

  const ev = selectedCity.events[selectedEventIdx];
  map.getSource("migration").setData(migrationGeoJSON(ev));

  renderLegend(
    `<div class="row"><i style="background:${ui.cityStroke}"></i>当前城市轮廓</div><div class="row"><i style="background:${ui.accent}"></i>迁徙方向（当前事件）</div>`
  );
  fitWuYue();
}

function restoreBranchColors() {
  map.setPaintProperty("branches-fill", "fill-color", branchFillColorExpr());
}

function syncCityStory() {
  const ev = selectedCity.events[selectedEventIdx];
  if (!ev) return;
  setStory({
    kicker: "城市个案 · " + selectedCity.name,
    title: ev.title,
    year: `${yearText(ev.year)} · ${ev.era || ""}`,
    body: ev.body,
  });
}

function syncCityPanel() {
  cityMeta.textContent = `今属 ${selectedCity.branch}`;
  citySelect.value = selectedCity.id;
  eventList.innerHTML = "";
  selectedCity.events.forEach((ev, idx) => {
    const li = document.createElement("li");
    if (idx === selectedEventIdx) li.classList.add("active");
    li.innerHTML = `<span class="year">${yearText(ev.year)} · ${ev.era || ""}</span><strong>${ev.title}</strong>`;
    li.addEventListener("click", () => {
      stopCityPlay();
      selectedEventIdx = idx;
      syncCityPanel();
      renderCityView();
    });
    eventList.appendChild(li);
  });
  syncCityStory();
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
  }, 2200);
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
  const focusCities = new Set(era.focusCityIds || []);

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

  // show focus city outlines
  if (focusCities.size) {
    map.setFilter("city-outline-fill", [
      "in",
      ["get", "id"],
      ["literal", [...focusCities]],
    ]);
    map.setFilter("city-outline-line", [
      "in",
      ["get", "id"],
      ["literal", [...focusCities]],
    ]);
  } else {
    map.setFilter("city-outline-fill", ["==", ["get", "id"], ""]);
    map.setFilter("city-outline-line", ["==", ["get", "id"], ""]);
  }

  map.setPaintProperty("cities-circle", "circle-opacity", 1);
  map.setPaintProperty("cities-circle", "circle-radius", [
    "case",
    ["in", ["get", "id"], ["literal", [...focusCities]]],
    6,
    3,
  ]);
  map.setPaintProperty("cities-circle", "circle-color", [
    "case",
    ["in", ["get", "id"], ["literal", [...focusCities]]],
    ui.accent,
    "#C4B8A8",
  ]);
  map.getSource("migration").setData({ type: "FeatureCollection", features: [] });

  const names = data.branchGeoJSON.features
    .filter((f) => focusIds.includes(f.properties.id))
    .map((f) => f.properties.name);
  renderLegend(
    `<div class="row"><i style="background:${ui.accent}"></i>本段亮起：${names.join("、") || "—"}</div>`
  );
  fitWuYue();
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

data.cities.forEach((c) => {
  const opt = document.createElement("option");
  opt.value = c.id;
  opt.textContent = `${c.name}（${c.branch}）`;
  citySelect.appendChild(opt);
});
citySelect.addEventListener("change", () => pickCity(citySelect.value, false));
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

  if (next === "era") {
    setEra(eraIdx);
  } else if (next === "branch") {
    setCityLayersVisible(false);
    setStory({
      kicker: "六片分支",
      title: "点击地图或列表",
      year: "",
      body: "单击单选填色，再点取消。悬停只看片名与一句简介。",
    });
    [...branchList.children].forEach((li) => li.classList.remove("active"));
    renderBranchView();
  } else {
    restoreBranchColors();
    selectedCity = data.cities.find((c) => c.id === "yangzhou") || data.cities[0];
    selectedEventIdx = 0;
    syncCityPanel();
    renderCityView();
    if (!cityEnterPlayed) {
      cityEnterPlayed = true;
      startCityAutoplay();
    }
  }
}

document.getElementById("layerTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-layer]");
  if (btn) setMode(btn.dataset.layer);
});
