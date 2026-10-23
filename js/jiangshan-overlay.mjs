/**
 * Local-only historical prefecture overlay for debug对照.
 *
 * Default off. GeoJSON is read from local/jiangshan-overlay/ only after the
 * overlay is enabled, and only if those files exist. Nothing here fetches a
 * published CHGIS/jiangshan asset. This layer does not replace dialect
 * polygons, era narration, focusBranchIds, or modern residual islands.
 */

export const STORAGE_KEY = "wuyue.jiangshanOverlay";
export const DATA_DIR = "local/jiangshan-overlay/";
export const SOURCE_ID = "jiangshan-overlay";

export const GROUP_STYLE = {
  yang: { fill: "#C45C26", line: "#8A3B12", label: "扬／广陵" },
  "yang-aside": { fill: "#C4A15A", line: "#8A6A10", label: "扬旁（泰州／高邮）" },
  xuan: { fill: "#2F6F6A", line: "#1C4A47", label: "宣／宁国" },
  jinqu: { fill: "#3D5A80", line: "#243652", label: "金衢" },
  yue: { fill: "#6B4C7A", line: "#3E2A48", label: "越（政区，非府）" },
};

/** App era id → local snapshot. Modern is intentionally empty. */
export const ERA_SNAPSHOTS = {
  "era-preqin": [
    { year: -403, file: "era-01-xianqin-y-403.geojson", kind: "polity" },
  ],
  "era-chu-qinhan": [
    { year: -100, file: "era-02-qinhan-y-100.geojson", kind: "prefecture" },
  ],
  "era-weijin": [
    { year: 440, file: "era-03-weijin-y440.geojson", kind: "prefecture" },
  ],
  "era-tang-nbsong": [
    { year: 741, file: "era-04-suibeisong-y741.geojson", kind: "prefecture" },
  ],
  "era-southern-song": [
    { year: 1200, file: "era-05-nansongyuan-y1200.geojson", kind: "prefecture" },
  ],
  "era-mingqing": [
    { year: 1415, file: "era-06a-ming-y1415.geojson", kind: "prefecture" },
    { year: 1820, file: "era-06b-qing-y1820.geojson", kind: "prefecture" },
  ],
  "era-modern": [],
};

/**
 * First-batch names only. Match title + layer exactly.
 * 处州 / 括州 are absent on purpose. 泰州 and 高邮军 are 旁看, not 扬州 itself.
 */
export const FIRST_BATCH = {
  "-403": [{ title: "越", layer: "polity", group: "yue" }],
  "-100": [{ title: "广陵国", layer: "prefecture", group: "yang" }],
  "440": [
    { title: "广陵郡", layer: "prefecture", group: "yang" },
    { title: "宣城郡", layer: "prefecture", group: "xuan" },
    { title: "东阳郡", layer: "prefecture", group: "jinqu" },
  ],
  "741": [
    { title: "扬州", layer: "prefecture", group: "yang" },
    { title: "宣州", layer: "prefecture", group: "xuan" },
    { title: "婺州", layer: "prefecture", group: "jinqu" },
    { title: "衢州", layer: "prefecture", group: "jinqu" },
  ],
  "1200": [
    { title: "扬州", layer: "prefecture", group: "yang" },
    { title: "泰州", layer: "prefecture", group: "yang-aside" },
    { title: "高邮军", layer: "prefecture", group: "yang-aside" },
    { title: "宁国府", layer: "prefecture", group: "xuan" },
    { title: "婺州", layer: "prefecture", group: "jinqu" },
    { title: "衢州", layer: "prefecture", group: "jinqu" },
  ],
  "1415": [
    { title: "扬州府", layer: "prefecture", group: "yang" },
    { title: "宁国府", layer: "prefecture", group: "xuan" },
    { title: "金华府", layer: "prefecture", group: "jinqu" },
    { title: "衢州府", layer: "prefecture", group: "jinqu" },
  ],
  "1820": [
    { title: "扬州府", layer: "prefecture", group: "yang" },
    { title: "宁国府", layer: "prefecture", group: "xuan" },
    { title: "金华府", layer: "prefecture", group: "jinqu" },
    { title: "衢州府", layer: "prefecture", group: "jinqu" },
  ],
};

/** Never paint these, even if a later edit adds them to the allowlist. */
export const FORBIDDEN_TITLES = new Set([
  "会稽",
  "会稽郡",
  "会稽县",
  "会稽国",
  "绍兴",
  "绍兴府",
  "丹阳",
  "丹阳郡",
  "丹阳尹",
  "丹阳县",
  "处州",
  "处州府",
  "括州",
]);

const YEAR_NOTE = {
  "-403": "无府级面，仅政区「越」。",
  "-100": "府级是广陵国；汉「扬州」是刺史部，不叠。",
  "440": "宣城郡不是丹阳尹；东阳郡不是会稽。",
  "741": "不含括州（处州）。",
  "1200": "泰州、高邮军只旁看；不含处州。",
  "1415": "不含处州府。",
  "1820": "不含处州府。",
};

const GROUP_ORDER = ["yang", "yang-aside", "xuan", "jinqu", "yue"];
const LAYER_FILL = "jiangshan-fill";
const LAYER_LINE = "jiangshan-line";
const LAYER_LINE_ASIDE = "jiangshan-line-aside";
const LAYER_IDS = [LAYER_FILL, LAYER_LINE, LAYER_LINE_ASIDE];
const EMPTY = { type: "FeatureCollection", features: [] };

export function yearText(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return "";
  return n < 0 ? "前" + Math.abs(n) + "年" : n + "年";
}

/**
 * URL wins over localStorage. Absent flag stays off and does not reveal the control.
 * persist "" clears storage; "jiangshan" stores on; null leaves storage alone.
 */
export function readOverlayFlag(search, stored) {
  const raw = search == null ? "" : String(search);
  const q = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw).get("overlay");
  if (q === "jiangshan") return { enabled: true, revealed: true, persist: "jiangshan" };
  if (q === "off" || q === "0") return { enabled: false, revealed: true, persist: "" };
  if (stored === "jiangshan") return { enabled: true, revealed: true, persist: null };
  return { enabled: false, revealed: false, persist: null };
}

export function snapshotForEra(eraId, mingqingYear = 1415) {
  const snaps = ERA_SNAPSHOTS[eraId];
  if (!snaps || !snaps.length) return null;
  if (eraId === "era-mingqing") {
    const want = Number(mingqingYear);
    return snaps.find((s) => s.year === want) || snaps[0];
  }
  return snaps[0];
}

function bboxArea(geometry) {
  const coords = [];
  const walk = (c) => {
    if (!Array.isArray(c) || !c.length) return;
    if (typeof c[0] === "number") {
      coords.push(c);
      return;
    }
    c.forEach(walk);
  };
  walk(geometry && geometry.coordinates);
  if (!coords.length) return 0;
  let minX = coords[0][0];
  let maxX = coords[0][0];
  let minY = coords[0][1];
  let maxY = coords[0][1];
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Math.max(0, (maxX - minX) * (maxY - minY));
}

export function labelPointFromFeature(feature) {
  const a = feature && feature.properties && feature.properties.anchor;
  if (Array.isArray(a) && a.length >= 2 && Number.isFinite(+a[0]) && Number.isFinite(+a[1])) {
    return [+a[0], +a[1]];
  }
  const g = feature && feature.geometry;
  if (!g) return null;
  let ring = null;
  if (g.type === "Polygon") ring = g.coordinates && g.coordinates[0];
  else if (g.type === "MultiPolygon") ring = g.coordinates && g.coordinates[0] && g.coordinates[0][0];
  if (!ring || !ring.length) return null;
  let x = 0;
  let y = 0;
  let n = 0;
  for (const c of ring) {
    if (!Array.isArray(c) || c.length < 2) continue;
    x += c[0];
    y += c[1];
    n += 1;
  }
  if (!n) return null;
  return [x / n, y / n];
}

/**
 * Keep one face per allowlisted title+layer. Drop region faces (Han 扬州部),
 * forbidden titles, and any other prefecture in the file.
 */
export function selectFirstBatch(collection, year) {
  const specs = FIRST_BATCH[String(year)] || [];
  const byKey = new Map(specs.map((s) => [`${s.layer}\0${s.title}`, s]));
  const seen = new Set();
  const features = [];
  for (const f of (collection && collection.features) || []) {
    const p = (f && f.properties) || {};
    const layer = p.layer;
    const title = typeof p.title === "string" ? p.title.trim() : "";
    if (layer !== "prefecture" && layer !== "polity") continue;
    if (FORBIDDEN_TITLES.has(title)) continue;
    if (p.source_year != null && Number(p.source_year) !== Number(year)) continue;
    const spec = byKey.get(`${layer}\0${title}`);
    if (!spec) continue;
    if (!f.geometry) continue;
    const key = `${layer}\0${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const role = spec.group === "yang-aside" ? "aside" : spec.layer === "polity" ? "polity" : "focus";
    features.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        title,
        layer,
        group: spec.group,
        role,
        year: Number(year),
        sortKey: bboxArea(f.geometry),
        anchor: Array.isArray(p.anchor) ? p.anchor : null,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function describeOverlay(year, features) {
  if (year == null || !Number.isFinite(Number(year))) return "近代不叠历史府界。";
  const y = yearText(year);
  const list = features || [];
  if (!list.length) {
    if (Number(year) === -403) return `${y} 框内无府级面。`;
    return `${y} 没有第一批府界。`;
  }
  const parts = [];
  for (const g of GROUP_ORDER) {
    const titles = list.filter((f) => f.properties.group === g).map((f) => f.properties.title);
    if (!titles.length) continue;
    if (g === "yang-aside") parts.push("旁看" + titles.join("、"));
    else if (g === "yue") parts.push("政区「" + titles.join("、") + "」（非府级）");
    else parts.push(titles.join("、"));
  }
  const note = YEAR_NOTE[String(year)] || "";
  return `对照 ${y} · ${parts.join("；")}${note ? " " + note : ""}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function groupColorExpr(paintKey) {
  const expr = ["match", ["get", "group"]];
  for (const [id, style] of Object.entries(GROUP_STYLE)) {
    expr.push(id, style[paintKey]);
  }
  expr.push(paintKey === "fill" ? "#8A6A5A" : "#5C463C");
  return expr;
}

function storageGet() {
  try {
    return globalThis.localStorage ? localStorage.getItem(STORAGE_KEY) : null;
  } catch (_) {
    return null;
  }
}

function storageSet(value) {
  try {
    if (!globalThis.localStorage) return;
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* private mode */
  }
}

/**
 * Draw the overlay on an existing MapLibre map. Call sync() when the active era changes.
 * Returns a no-op controller if the debug nodes are missing.
 */
export function mountJiangshanOverlay({ map, getEra, beforeLayerId }) {
  const maplibregl = globalThis.maplibregl;
  const panel = document.getElementById("jiangshanDebug");
  const toggle = document.getElementById("jiangshanToggle");
  const statusEl = document.getElementById("jiangshanStatus");
  const yearsEl = document.getElementById("jiangshanYears");
  const legendEl = document.getElementById("jiangshanLegend");
  const noop = { sync() {}, isEnabled: () => false };
  if (!map || !maplibregl || !panel || !toggle) return noop;

  const initial = readOverlayFlag(
    globalThis.location ? location.search : "",
    storageGet()
  );
  if (initial.persist != null) storageSet(initial.persist);

  let enabled = initial.enabled;
  let revealed = initial.revealed;
  let mingqingYear = 1415;
  let syncToken = 0;
  let appliedKey = "";
  const cache = new Map();
  const markers = [];
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });

  map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY });
  const before = beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined;
  map.addLayer(
    {
      id: LAYER_FILL,
      type: "fill",
      source: SOURCE_ID,
      layout: {
        visibility: "none",
        "fill-sort-key": ["-", 0, ["get", "sortKey"]],
      },
      paint: {
        "fill-color": groupColorExpr("fill"),
        "fill-opacity": ["match", ["get", "role"], "aside", 0.16, "polity", 0.14, 0.28],
      },
    },
    before
  );
  map.addLayer(
    {
      id: LAYER_LINE,
      type: "line",
      source: SOURCE_ID,
      filter: ["!=", ["get", "role"], "aside"],
      layout: {
        visibility: "none",
        "line-sort-key": ["-", 0, ["get", "sortKey"]],
      },
      paint: {
        "line-color": groupColorExpr("line"),
        "line-width": 2.2,
        "line-opacity": 0.95,
      },
    },
    before
  );
  map.addLayer(
    {
      id: LAYER_LINE_ASIDE,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "role"], "aside"],
      layout: {
        visibility: "none",
        "line-sort-key": ["-", 0, ["get", "sortKey"]],
      },
      paint: {
        "line-color": groupColorExpr("line"),
        "line-width": 1.7,
        "line-dasharray": [1.6, 1.1],
        "line-opacity": 0.95,
      },
    },
    before
  );

  function clearLabels() {
    while (markers.length) {
      const m = markers.pop();
      try { m.remove(); } catch (_) {}
    }
  }

  function clearMap() {
    const src = map.getSource(SOURCE_ID);
    if (src) src.setData(EMPTY);
    for (const id of LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    }
    clearLabels();
    popup.remove();
    if (legendEl) {
      legendEl.hidden = true;
      legendEl.innerHTML = "";
    }
  }

  function showFeatures(fc) {
    const src = map.getSource(SOURCE_ID);
    if (src) {
      src.setData({
        type: "FeatureCollection",
        features: fc.features.map((f) => ({
          type: "Feature",
          geometry: f.geometry,
          properties: {
            title: f.properties.title,
            layer: f.properties.layer,
            group: f.properties.group,
            role: f.properties.role,
            year: f.properties.year,
            sortKey: f.properties.sortKey,
          },
        })),
      });
    }
    for (const id of LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    }
    clearLabels();
    for (const f of fc.features) {
      const pt = labelPointFromFeature(f);
      if (!pt) continue;
      const style = GROUP_STYLE[f.properties.group] || {};
      const el = document.createElement("div");
      el.className = "map-label jiangshan-label";
      el.textContent = f.properties.role === "aside" ? f.properties.title + "·旁" : f.properties.title;
      if (style.line) el.style.borderColor = style.line;
      markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(pt).addTo(map));
    }
    if (!legendEl) return;
    const groups = GROUP_ORDER.filter((g) => fc.features.some((f) => f.properties.group === g));
    if (!groups.length) {
      legendEl.hidden = true;
      legendEl.innerHTML = "";
      return;
    }
    legendEl.hidden = false;
    legendEl.innerHTML = groups
      .map((g) => {
        const style = GROUP_STYLE[g];
        return `<div class="row"><i style="background:${style.fill};border:1px solid ${style.line}"></i>${escapeHtml(style.label)}</div>`;
      })
      .join("") + `<div class="row">历史府界对照 · 非方言几何</div>`;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function renderYearButtons(eraId) {
    if (!yearsEl) return;
    yearsEl.innerHTML = "";
    if (!enabled || eraId !== "era-mingqing") {
      yearsEl.hidden = true;
      return;
    }
    yearsEl.hidden = false;
    for (const snap of ERA_SNAPSHOTS["era-mingqing"]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "era-nav-btn";
      btn.textContent = snap.year === 1415 ? "1415 明" : "1820 清";
      btn.setAttribute("aria-pressed", snap.year === mingqingYear ? "true" : "false");
      btn.addEventListener("click", () => {
        mingqingYear = snap.year;
        sync();
      });
      yearsEl.appendChild(btn);
    }
  }

  function bindHover(layerId) {
    map.on("mousemove", layerId, (e) => {
      if (!enabled) return;
      const f = e.features && e.features[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties || {};
      const style = GROUP_STYLE[p.group] || {};
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${escapeHtml(p.title || "")}</strong>` +
            `<div style="margin-top:4px;font-size:12px;opacity:.85">${escapeHtml(yearText(p.year))} · ${escapeHtml(p.layer || "")} · ${escapeHtml(style.label || "")}</div>` +
            `<div style="margin-top:4px;font-size:11px;opacity:.75">本地对照，非方言几何</div>`
        )
        .addTo(map);
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
  }
  bindHover(LAYER_FILL);
  bindHover(LAYER_LINE);
  bindHover(LAYER_LINE_ASIDE);

  async function loadSnapshot(file) {
    if (cache.has(file)) return cache.get(file);
    const res = await fetch(DATA_DIR + file, { cache: "no-store" });
    if (!res.ok) {
      const err = new Error("missing overlay file");
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (!json || json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
      throw new Error("bad overlay geojson");
    }
    cache.set(file, json);
    return json;
  }

  function applyChrome(eraId) {
    panel.hidden = !revealed;
    toggle.checked = enabled;
    renderYearButtons(eraId);
  }

  async function sync() {
    const token = ++syncToken;
    const era = (typeof getEra === "function" && getEra()) || {};
    const eraId = era.id || "";
    applyChrome(eraId);
    if (!enabled) {
      appliedKey = "off";
      clearMap();
      setStatus(revealed ? "对照层关。今界方言面不变。" : "");
      return;
    }
    const snap = snapshotForEra(eraId, mingqingYear);
    if (!snap) {
      appliedKey = `on|${eraId}|none`;
      clearMap();
      setStatus(describeOverlay(null, []));
      return;
    }
    const key = `on|${snap.file}|${snap.year}`;
    if (key === appliedKey) return;
    try {
      const raw = await loadSnapshot(snap.file);
      if (token !== syncToken) return;
      const fc = selectFirstBatch(raw, snap.year);
      appliedKey = key;
      if (!fc.features.length) clearMap();
      else showFeatures(fc);
      setStatus(describeOverlay(snap.year, fc.features));
    } catch (_) {
      if (token !== syncToken) return;
      appliedKey = key;
      clearMap();
      setStatus(`未找到 ${DATA_DIR}${snap.file}。对照 GeoJSON 只放本地，不进发布包。`);
    }
  }

  toggle.addEventListener("change", () => {
    enabled = toggle.checked;
    storageSet(enabled ? "jiangshan" : "");
    appliedKey = "";
    sync();
  });

  return {
    sync,
    isEnabled: () => enabled,
  };
}
