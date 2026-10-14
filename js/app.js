(async function () {
  const res = await fetch("data/wuyue-map-data.json");
  const data = await res.json();

  const map = L.map("map", { zoomControl: true }).setView([30.6, 120.0], 7);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  const layers = { era: L.layerGroup().addTo(map), branch: L.layerGroup(), city: L.layerGroup() };
  let arrows = L.layerGroup().addTo(map);
  let mode = "era";
  let selectedCity = data.cities[0];
  let branchGeoLayer = null;

  const eraSlider = document.getElementById("eraSlider");
  const eraLabel = document.getElementById("eraLabel");
  const eraSummary = document.getElementById("eraSummary");
  const branchList = document.getElementById("branchList");
  const citySelect = document.getElementById("citySelect");
  const cityMeta = document.getElementById("cityMeta");
  const eventList = document.getElementById("eventList");

  eraSlider.max = String(data.eras.length - 1);

  function yearText(y) {
    if (y < 0) return "前" + Math.abs(y) + "年";
    return y + "年";
  }

  function clearArrows() {
    arrows.clearLayers();
  }

  function drawArrow(from, to) {
    const latlngs = [L.latLng(from[0], from[1]), L.latLng(to[0], to[1])];
    L.polyline(latlngs, { color: "#e8a54b", weight: 3, opacity: 0.9, dashArray: "6 6" }).addTo(arrows);
    L.circleMarker(latlngs[0], { radius: 5, color: "#fff", fillColor: "#e8a54b", fillOpacity: 1, weight: 1 }).addTo(arrows);
    L.circleMarker(latlngs[1], { radius: 7, color: "#fff", fillColor: "#3db8a0", fillOpacity: 1, weight: 1 }).addTo(arrows);
  }

  function showEra(i) {
    const era = data.eras[i];
    eraLabel.textContent = era.label;
    eraSummary.textContent = yearText(era.yearStart) + " — " + yearText(era.yearEnd) + "\n\n" + era.summary;
    layers.era.clearLayers();
    const focus = era.yearStart >= 1127 ? [31.5, 119.8] : [30.8, 120.2];
    const r = era.yearStart < 0 ? 220000 : era.yearStart < 600 ? 180000 : 150000;
    L.circle(focus, {
      radius: r,
      color: "#34d399",
      fillColor: "#34d399",
      fillOpacity: 0.12,
      weight: 1.5,
    }).bindPopup("<strong>" + era.label + "</strong><br>" + era.summary).addTo(layers.era);
  }

  function styleBranch(feature) {
    const c = (feature.properties && feature.properties.fillColor) || "#888";
    return {
      color: c,
      weight: 1.5,
      opacity: 0.95,
      fillColor: c,
      fillOpacity: 0.38,
    };
  }

  function buildBranches() {
    layers.branch.clearLayers();
    branchList.innerHTML = "";

    if (data.branchGeoJSON) {
      branchGeoLayer = L.geoJSON(data.branchGeoJSON, {
        style: styleBranch,
        onEachFeature: function (feature, layer) {
          const p = feature.properties || {};
          const name = p.name || "";
          const summary = p.summary || "";
          layer.bindPopup("<strong>" + name + "</strong><br>" + summary +
            "<br><small style='opacity:.7'>示意范围，非精确同言线</small>");
          layer.on({
            mouseover: function (e) {
              e.target.setStyle({ weight: 3, fillOpacity: 0.55 });
            },
            mouseout: function (e) {
              branchGeoLayer.resetStyle(e.target);
            },
          });
        },
      }).addTo(layers.branch);

      data.branchGeoJSON.features.forEach(function (ft) {
        const p = ft.properties || {};
        const li = document.createElement("li");
        const swatch = document.createElement("span");
        swatch.style.cssText = "display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;background:" + (p.fillColor || "#888");
        li.appendChild(swatch);
        li.appendChild(document.createTextNode(p.name || ""));
        li.title = p.summary || "";
        li.addEventListener("click", function () {
          const layer = branchGeoLayer.getLayers().find(function (l) {
            return l.feature && l.feature.properties && l.feature.properties.name === p.name;
          });
          if (layer) {
            map.fitBounds(layer.getBounds(), { padding: [30, 30] });
            layer.openPopup();
          }
        });
        branchList.appendChild(li);
      });
    } else {
      data.branches.forEach(function (b) {
        const m = L.circleMarker([b.lat, b.lng], {
          radius: 11,
          color: "#c084fc",
          fillColor: "#c084fc",
          fillOpacity: 0.85,
          weight: 2,
        }).bindPopup("<strong>" + b.name + "</strong><br>" + b.summary);
        m.addTo(layers.branch);
        const li = document.createElement("li");
        li.textContent = b.name;
        li.addEventListener("click", function () {
          map.setView([b.lat, b.lng], 8);
          m.openPopup();
        });
        branchList.appendChild(li);
      });
    }
  }

  function renderCity(city) {
    selectedCity = city;
    cityMeta.innerHTML = "<strong>" + city.name + "</strong> · 今属 " + city.branch;
    eventList.innerHTML = "";
    clearArrows();
    layers.city.clearLayers();

    L.circleMarker([city.lat, city.lng], {
      radius: 10,
      color: "#5b8def",
      fillColor: "#5b8def",
      fillOpacity: 0.95,
      weight: 2,
    }).bindPopup("<strong>" + city.name + "</strong><br>今属：" + city.branch).addTo(layers.city);

    city.events.forEach(function (ev, idx) {
      const li = document.createElement("li");
      li.innerHTML = "<span class=\"year\">" + yearText(ev.year) + " · " + ev.era +
        "</span><strong>" + ev.title + "</strong><span class=\"body\">" + ev.body + "</span>";
      li.addEventListener("click", function () {
        Array.prototype.forEach.call(eventList.children, function (n) { n.classList.remove("active"); });
        li.classList.add("active");
        clearArrows();
        drawArrow(ev.from, ev.to);
        map.fitBounds(L.latLngBounds([ev.from, ev.to]).pad(0.35));
        L.popup()
          .setLatLng(ev.to)
          .setContent("<strong>" + ev.title + "</strong><br><small>" + yearText(ev.year) + " · " + ev.era + "</small><br>" + ev.body)
          .openOn(map);
      });
      eventList.appendChild(li);
      if (idx === 0) li.click();
    });
  }

  data.cities.forEach(function (c) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name + "（" + c.branch + "）";
    citySelect.appendChild(opt);
  });
  citySelect.addEventListener("change", function () {
    const city = data.cities.find(function (c) { return c.id === citySelect.value; });
    renderCity(city);
  });

  buildBranches();
  showEra(0);
  renderCity(data.cities[0]);

  eraSlider.addEventListener("input", function () { showEra(Number(eraSlider.value)); });

  function setMode(next) {
    mode = next;
    document.querySelectorAll("#layerTabs button").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.layer === next);
    });
    document.getElementById("eraControls").classList.toggle("hidden", next !== "era");
    document.getElementById("branchControls").classList.toggle("hidden", next !== "branch");
    document.getElementById("cityControls").classList.toggle("hidden", next !== "city");
    Object.keys(layers).forEach(function (k) {
      if (k === next) map.addLayer(layers[k]);
      else map.removeLayer(layers[k]);
    });
    clearArrows();
    if (next === "era") {
      showEra(Number(eraSlider.value));
      map.setView([30.6, 120.0], 7);
    } else if (next === "branch") {
      if (branchGeoLayer) map.fitBounds(branchGeoLayer.getBounds(), { padding: [24, 24] });
      else map.setView([29.8, 120.2], 7);
    } else {
      renderCity(selectedCity);
    }
  }

  document.getElementById("layerTabs").addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-layer]");
    if (btn) setMode(btn.dataset.layer);
  });

  // tweak branch pane hint
  const hint = document.querySelector("#branchControls .hint");
  if (hint) hint.textContent = "六片示意 choropleth（非精确同言线）。点击色块或列表查看简介。";

  setMode("era");
})();
