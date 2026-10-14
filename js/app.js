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
const branchList = document.getElementById("branchList");
const citySelect = document.getElementById("citySelect");
const cityMeta = document.getElementById("cityMeta");
const eventList = document.getElementById("eventList");
const playBtn = document.getElementById("playBtn");
const storyKicker = document.getElementById("storyKicker");
const storyTitle = document.getElementById("storyTitle");
const storyYear = document.getElementById("storyYear");
const storyBody = document.getElementById("storyBody");

eraSlider.max = String(data.eras.length - 1);
eraSlider.value = "4";

let mode = "branch";
let selectedBranchId = null;
let selectedCity = data.cities.find((c) => c.id === "yangzhou") || data.cities[0];
let selectedEventIdx = 0;
let playTimer = null;
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

function cityOutline(id) {
  const feats = (data.cityOutlines && data.cityOutlines.features) || [];
  return feats.find((f) => f.properties && f.properties.id === id) || null;
}

function size() {
  const box = plotEl.getBoundingClientRect();
  const w = Math.max(640, Math.floor(box.width) || plotEl.clientWidth || 640);
  const h = Math.max(520, Math.floor(box.height) || plotEl.clientHeight || Math.floor(window.innerHeight * 0.7));
  return { width: w, height: h };
}

function baseProjection() {
  return {
    type: "mercator",
    domain: data.branchGeoJSON,
    inset: 18,
  };
}

function stopPlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  playBtn.classList.remove("playing");
  playBtn.textContent = "自动播放前 3 事";
  playBtn.disabled = false;
}

function renderLegend(items) {
  legendEl.innerHTML = items
    .map((it) => `<div class="row"><i style="background:${it.color}"></i>${it.label}</div>`)
    .join("");
}

function renderBranch() {
  const { width, height } = size();
  const chart = Plot.plot({
    width,
    height,
    projection: baseProjection(),
    style: { background: ui.background },
    marks: [
      Plot.geo(data.branchGeoJSON, {
        fill: (d) => d.properties.fillColor,
        fillOpacity: (d) => {
          if (!selectedBranchId) return 0.5;
          return d.properties.id === selectedBranchId ? 0.72 : 0.14;
        },
        stroke: (d) => (selectedBranchId === d.properties.id ? ui.ink : "#FFFaf3"),
        strokeWidth: (d) => (selectedBranchId === d.properties.id ? 1.8 : 0.7),
        title: (d) => `${d.properties.name}\n${shortTip(d.properties)}`,
        tip: true,
      }),
    ],
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
    path.addEventListener("click", (e) => {
      e.preventDefault();
      selectBranch(feats[i].properties.id, true);
    });
  });
}

function selectBranch(id, fromMap) {
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
        body: shortTip(f.properties) + (fromMap ? "" : ""),
      });
      // detail stays short; full summary only in story body if shortTip short
      if ((f.properties.summary || "").length > (f.properties.shortTip || "").length + 4) {
        storyBody.textContent = f.properties.summary;
      }
    }
  }
  [...branchList.children].forEach((li) => {
    li.classList.toggle("active", li.dataset.id === selectedBranchId);
  });
  renderBranch();
}

function buildBranchList() {
  branchList.innerHTML = "";
  data.branchGeoJSON.features.forEach((f) => {
    const p = f.properties;
    const li = document.createElement("li");
    li.dataset.id = p.id;
    li.title = shortTip(p);
    li.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;background:${p.fillColor}"></span>${p.name}<span style="display:block;margin-top:4px;font-size:.78rem;color:var(--muted);line-height:1.4">${shortTip(p)}</span>`;
    li.addEventListener("click", () => selectBranch(p.id, false));
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

  // map city dots → swap story only
  const circles = [...chart.querySelectorAll("circle")];
  const cityCircles = circles.slice(0, data.cities.length);
  cityCircles.forEach((c, i) => {
    const city = data.cities[i];
    if (!city) return;
    c.style.cursor = "pointer";
    c.addEventListener("click", (e) => {
      e.preventDefault();
      pickCity(city.id, false);
    });
  });
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
      stopPlay();
      selectedEventIdx = idx;
      syncCityPanel();
      syncCityStory();
      renderCity();
    });
    eventList.appendChild(li);
  });
  syncCityStory();
}

function pickCity(id, autoplay) {
  stopPlay();
  selectedCity = data.cities.find((c) => c.id === id) || selectedCity;
  selectedEventIdx = 0;
  syncCityPanel();
  renderCity();
  if (autoplay) startAutoplay();
}

function startAutoplay() {
  stopPlay();
  const maxIdx = Math.min(2, selectedCity.events.length - 1);
  selectedEventIdx = 0;
  syncCityPanel();
  renderCity();
  playBtn.classList.add("playing");
  playBtn.textContent = "播放中…";
  let step = 0;
  playTimer = setInterval(() => {
    step += 1;
    if (step > maxIdx) {
      stopPlay();
      return;
    }
    selectedEventIdx = step;
    syncCityPanel();
    renderCity();
  }, 2200);
}

function renderEra() {
  const i = Number(eraSlider.value);
  const era = data.eras[i];
  const focusIds = new Set(era.focusCityIds || []);
  const focusCities = data.cities.filter((c) => focusIds.has(c.id));

  setStory({
    kicker: "长时段",
    title: era.label,
    year: `${yearText(era.yearStart)} — ${yearText(era.yearEnd)}`,
    body: era.summary,
  });

  const { width, height } = size();
  const t = i / Math.max(1, data.eras.length - 1);

  const focusBranchIds = new Set(era.focusBranchIds || []);
  const marks = [
    Plot.geo(data.branchGeoJSON, {
      fill: (d) => d.properties.fillColor,
      fillOpacity: (d) => {
        if (!focusBranchIds.size) return 0.45;
        return focusBranchIds.has(d.properties.id) ? 0.62 : 0.1;
      },
      stroke: (d) => (focusBranchIds.has(d.properties.id) ? ui.ink : "#FFFaf3"),
      strokeWidth: (d) => (focusBranchIds.has(d.properties.id) ? 1.2 : 0.5),
    }),
  ];

  // highlight outlines of focus cities
  focusCities.forEach((c) => {
    const outline = cityOutline(c.id);
    if (outline) {
      marks.push(
        Plot.geo(outline, {
          fill: ui.cityFill,
          stroke: ui.cityStroke,
          strokeWidth: 1.6,
          fillOpacity: 0.55,
        })
      );
    }
  });

  marks.push(
    Plot.dot(data.cities, {
      x: "lng",
      y: "lat",
      r: (d) => (focusIds.has(d.id) ? 5.5 : 2.5),
      fill: (d) => (focusIds.has(d.id) ? ui.accent : "#C4B8A8"),
      stroke: "#FFFaf3",
      strokeWidth: 1,
      tip: true,
      title: (d) => d.name,
    })
  );

  marks.push(
    Plot.text([era.label], {
      frameAnchor: "top-left",
      dx: 16,
      dy: 20,
      fontSize: 14,
      fill: ui.ink,
      fontWeight: 650,
    })
  );

  const chart = Plot.plot({
    width,
    height,
    projection: baseProjection(),
    style: { background: ui.background },
    marks,
  });
  plotEl.replaceChildren(chart);
  const focusBranchNames = data.branchGeoJSON.features
    .filter((f) => focusBranchIds.has(f.properties.id))
    .map((f) => f.properties.name);
  legendEl.innerHTML = [
    focusBranchNames.length
      ? `<div class="row"><i style="background:${ui.accent}"></i>本段亮起：${focusBranchNames.join("、")}</div>`
      : "",
    focusCities.length
      ? `<div class="row">相关城：${focusCities.map((c) => c.name).join("、")}</div>`
      : "",
  ].filter(Boolean).join("") || `<div class="row">旁白见左侧</div>`;
}

data.cities.forEach((c) => {
  const opt = document.createElement("option");
  opt.value = c.id;
  opt.textContent = `${c.name}（${c.branch}）`;
  citySelect.appendChild(opt);
});
citySelect.addEventListener("change", () => {
  pickCity(citySelect.value, false);
});

playBtn.addEventListener("click", () => {
  if (playTimer) stopPlay();
  else startAutoplay();
});

eraSlider.addEventListener("input", () => {
  if (mode === "era") renderEra();
});

function setMode(next) {
  stopPlay();
  mode = next;
  document.querySelectorAll("#layerTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layer === next);
  });
  document.getElementById("eraControls").classList.toggle("hidden", next !== "era");
  document.getElementById("branchControls").classList.toggle("hidden", next !== "branch");
  document.getElementById("cityControls").classList.toggle("hidden", next !== "city");

  if (next === "era") {
    renderEra();
  } else if (next === "branch") {
    selectedBranchId = null;
    setStory({
      kicker: "六片分支",
      title: "点击地图或列表",
      year: "",
      body: "单击单选填色，再点取消。悬停只看片名与一句简介。",
    });
    [...branchList.children].forEach((li) => li.classList.remove("active"));
    renderBranch();
  } else {
    // city: default Yangzhou storyline, autoplay first 3 once per enter
    selectedCity = data.cities.find((c) => c.id === "yangzhou") || data.cities[0];
    selectedEventIdx = 0;
    syncCityPanel();
    renderCity();
    if (!cityEnterPlayed) {
      cityEnterPlayed = true;
      startAutoplay();
    }
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
