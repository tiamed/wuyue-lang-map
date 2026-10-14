import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";

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

const root = document.documentElement;
root.style.setProperty("--bg", ui.background);
root.style.setProperty("--text", ui.ink);
root.style.setProperty("--muted", ui.mutedInk);
root.style.setProperty("--accent", ui.accent);
root.style.setProperty("--accent2", ui.accent);
root.style.setProperty("--water", ui.water);
root.style.setProperty("--city-stroke", ui.cityStroke);
root.style.setProperty("--ink", ui.ink);

const plotEl = document.getElementById("plot");
const legendEl = document.getElementById("legend");
const eraSlider = document.getElementById("eraSlider");
const eraLabel = document.getElementById("eraLabel");
const eraSummary = document.getElementById("eraSummary");
const branchList = document.getElementById("branchList");
const branchDetail = document.getElementById("branchDetail");
const citySelect = document.getElementById("citySelect");
const cityMeta = document.getElementById("cityMeta");
const eventList = document.getElementById("eventList");

eraSlider.max = String(data.eras.length - 1);
eraSlider.value = "4";

let mode = "branch";
let selectedBranchId = null;
let selectedCity = data.cities.find((c) => c.id === "yangzhou") || data.cities[0];
let selectedEventIdx = 0;

function yearText(y) {
  return y < 0 ? "前" + Math.abs(y) + "年" : y + "年";
}

function cityOutline(id) {
  const feats = (data.cityOutlines && data.cityOutlines.features) || [];
  return feats.find((f) => f.properties && f.properties.id === id) || null;
}

function size() {
  const wrap = plotEl.parentElement;
  return {
    width: Math.max(480, wrap.clientWidth - 8),
    height: Math.max(420, wrap.clientHeight - 8),
  };
}

function baseProjection() {
  return {
    type: "mercator",
    domain: data.branchGeoJSON,
    inset: 18,
  };
}

function renderLegend(items) {
  legendEl.innerHTML = items
    .map((it) => `<div class="row"><i style="background:${it.color}"></i>${it.label}</div>`)
    .join("");
}

function renderBranch() {
  const { width, height } = size();
  const marks = [
    Plot.geo(data.branchGeoJSON, {
      fill: (d) => d.properties.fillColor,
      fillOpacity: (d) => (selectedBranchId && d.properties.id !== selectedBranchId ? 0.22 : 0.55),
      stroke: (d) => (selectedBranchId === d.properties.id ? ui.ink : "#FFFaf3"),
      strokeWidth: (d) => (selectedBranchId === d.properties.id ? 1.8 : 0.7),
      title: (d) => `${d.properties.name}\n${d.properties.summary}`,
      tip: true,
    }),
  ];

  const chart = Plot.plot({
    width,
    height,
    projection: baseProjection(),
    style: { background: ui.background },
    marks,
  });

  plotEl.replaceChildren(chart);
  renderLegend(
    data.branchGeoJSON.features.map((f) => ({
      color: f.properties.fillColor,
      label: f.properties.name,
    }))
  );

  const paths = chart.querySelectorAll("path");
  const feats = data.branchGeoJSON.features;
  paths.forEach((path, i) => {
    if (!feats[i]) return;
    path.style.cursor = "pointer";
    path.addEventListener("click", () => selectBranch(feats[i].properties.id));
  });
}

function selectBranch(id) {
  selectedBranchId = id;
  const f = data.branchGeoJSON.features.find((x) => x.properties.id === id);
  [...branchList.children].forEach((li) => {
    li.classList.toggle("active", li.dataset.id === id);
  });
  if (f) {
    const admins = (f.properties.admins || []).join("、");
    branchDetail.innerHTML = `<strong style="color:var(--text)">${f.properties.name}</strong><br>${f.properties.summary}<br><br><span style="font-size:.8rem">涵盖（示意）：${admins}</span><br><span style="font-size:.75rem;opacity:.75">${f.properties.note || ""}</span>`;
  }
  renderBranch();
}

function buildBranchList() {
  branchList.innerHTML = "";
  data.branchGeoJSON.features.forEach((f) => {
    const p = f.properties;
    const li = document.createElement("li");
    li.dataset.id = p.id;
    li.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;background:${p.fillColor}"></span>${p.name}`;
    li.addEventListener("click", () => selectBranch(p.id));
    branchList.appendChild(li);
  });
}

function renderCity() {
  const { width, height } = size();
  const outline = cityOutline(selectedCity.id);
  const ev = selectedCity.events[selectedEventIdx] || selectedCity.events[0];
  const marks = [];

  marks.push(
    Plot.geo(data.branchGeoJSON, {
      fill: ui.water,
      fillOpacity: 0.28,
      stroke: "#FFFaf3",
      strokeWidth: 0.5,
    })
  );

  if (outline) {
    marks.push(
      Plot.geo(outline, {
        fill: ui.cityFill,
        stroke: ui.cityStroke,
        strokeWidth: 2,
      })
    );
  }

  marks.push(
    Plot.dot(data.cities, {
      x: "lng",
      y: "lat",
      r: (d) => (d.id === selectedCity.id ? 6 : 3.5),
      fill: (d) => (d.id === selectedCity.id ? ui.accent : ui.mutedInk),
      stroke: "#FFFaf3",
      strokeWidth: 1,
      tip: true,
      title: (d) => `${d.name}（${d.branch}）`,
    })
  );

  if (ev && ev.from && ev.to) {
    marks.push(
      Plot.link([ev], {
        x1: (d) => d.from[1],
        y1: (d) => d.from[0],
        x2: (d) => d.to[1],
        y2: (d) => d.to[0],
        stroke: ui.accent,
        strokeWidth: 2,
        markerEnd: "arrow",
        strokeOpacity: 0.9,
      })
    );
  }

  const chart = Plot.plot({
    width,
    height,
    projection: baseProjection(),
    style: { background: ui.background },
    marks,
  });
  plotEl.replaceChildren(chart);
  legendEl.innerHTML = `<div class="row"><i style="background:${ui.cityStroke}"></i>当前城市轮廓</div><div class="row"><i style="background:${ui.accent}"></i>迁徙方向（当前事件）</div>`;
}

function renderEra() {
  const i = Number(eraSlider.value);
  const era = data.eras[i];
  eraLabel.textContent = era.label;
  eraSummary.textContent = `${yearText(era.yearStart)} — ${yearText(era.yearEnd)}\n\n${era.summary}`;

  const { width, height } = size();
  const t = i / Math.max(1, data.eras.length - 1);
  const chart = Plot.plot({
    width,
    height,
    projection: baseProjection(),
    style: { background: ui.background },
    marks: [
      Plot.geo(data.branchGeoJSON, {
        fill: (d) => d.properties.fillColor,
        fillOpacity: 0.15 + t * 0.45,
        stroke: "#FFFaf3",
        strokeWidth: 0.8,
        tip: true,
        title: (d) => d.properties.name,
      }),
      Plot.text([era.label], {
        frameAnchor: "top-left",
        dx: 16,
        dy: 20,
        fontSize: 14,
        fill: ui.ink,
        fontWeight: 650,
      }),
    ],
  });
  plotEl.replaceChildren(chart);
  legendEl.innerHTML = `<div class="row">长时段示意：片区轮廓随时代逐渐清晰（非真实扩张动画）</div>`;
}

function syncCityPanel() {
  cityMeta.innerHTML = `<strong>${selectedCity.name}</strong> · 今属 ${selectedCity.branch}`;
  citySelect.value = selectedCity.id;
  eventList.innerHTML = "";
  selectedCity.events.forEach((ev, idx) => {
    const li = document.createElement("li");
    if (idx === selectedEventIdx) li.classList.add("active");
    li.innerHTML = `<span class="year">${yearText(ev.year)} · ${ev.era}</span><strong>${ev.title}</strong><span class="body">${ev.body}</span>`;
    li.addEventListener("click", () => {
      selectedEventIdx = idx;
      syncCityPanel();
      renderCity();
    });
    eventList.appendChild(li);
  });
}

data.cities.forEach((c) => {
  const opt = document.createElement("option");
  opt.value = c.id;
  opt.textContent = `${c.name}（${c.branch}）`;
  citySelect.appendChild(opt);
});
citySelect.addEventListener("change", () => {
  selectedCity = data.cities.find((c) => c.id === citySelect.value);
  selectedEventIdx = 0;
  syncCityPanel();
  renderCity();
});

eraSlider.addEventListener("input", () => {
  if (mode === "era") renderEra();
});

function setMode(next) {
  mode = next;
  document.querySelectorAll("#layerTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layer === next);
  });
  document.getElementById("eraControls").classList.toggle("hidden", next !== "era");
  document.getElementById("branchControls").classList.toggle("hidden", next !== "branch");
  document.getElementById("cityControls").classList.toggle("hidden", next !== "city");
  if (next === "era") renderEra();
  else if (next === "branch") renderBranch();
  else {
    syncCityPanel();
    renderCity();
  }
}

document.getElementById("layerTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-layer]");
  if (btn) setMode(btn.dataset.layer);
});

window.addEventListener("resize", () => {
  if (mode === "era") renderEra();
  else if (mode === "branch") renderBranch();
  else renderCity();
});

buildBranchList();
setMode("branch");
