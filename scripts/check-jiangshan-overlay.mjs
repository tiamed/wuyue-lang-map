/**
 * Checks the local prefecture-overlay filter.
 * Synthetic cases always run. The CHGIS pack is optional and gitignored;
 * when it is present, every first-batch file must match the allowlist exactly.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  DATA_DIR,
  ERA_SNAPSHOTS,
  FIRST_BATCH,
  FORBIDDEN_TITLES,
  describeOverlay,
  readOverlayFlag,
  selectFirstBatch,
  snapshotForEra,
} from "../js/jiangshan-overlay.mjs";

let failed = 0;
function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error("FAIL", message);
}

function feat(layer, title, extra = {}) {
  return {
    type: "Feature",
    properties: { layer, title, ...extra },
    geometry: {
      type: "Polygon",
      coordinates: [[[118, 30], [119, 30], [119, 31], [118, 30]]],
    },
  };
}

function titlesOf(fc) {
  return fc.features.map((f) => `${f.properties.layer}:${f.properties.title}`).sort();
}

const trap = {
  type: "FeatureCollection",
  features: [
    feat("region", "扬州"),
    feat("prefecture", "广陵国"),
    feat("prefecture", "丹阳郡"),
    feat("prefecture", "丹阳尹"),
    feat("prefecture", "会稽郡"),
    feat("prefecture", "绍兴府"),
    feat("prefecture", "宣城郡"),
    feat("prefecture", "东阳郡"),
    feat("prefecture", "处州"),
    feat("prefecture", "处州府"),
    feat("prefecture", "括州"),
    feat("prefecture", "扬州"),
    feat("prefecture", "宣州"),
    feat("prefecture", "婺州"),
    feat("prefecture", "衢州"),
    feat("prefecture", "泰州"),
    feat("prefecture", "高邮军"),
    feat("prefecture", "宁国府"),
    feat("prefecture", "金华府"),
    feat("prefecture", "衢州府"),
    feat("prefecture", "扬州府"),
    feat("polity", "越"),
    feat("polity", "南越"),
    feat("polity", "楚"),
  ],
};

assert(
  titlesOf(selectFirstBatch(trap, -100)).join(",") === "prefecture:广陵国",
  "−100 keeps 广陵国 and drops Han 扬州 region"
);
const y440 = titlesOf(selectFirstBatch(trap, 440));
assert(
  y440.join(",") === ["prefecture:东阳郡", "prefecture:宣城郡"].sort().join(","),
  "440 keeps 宣城郡 and 东阳郡 only"
);
assert(y440.includes("prefecture:宣城郡") && y440.includes("prefecture:东阳郡"), "440 focus");
assert(!y440.some((t) => t.includes("丹阳") || t.includes("会稽") || t.includes("扬州")), "440 forbidden");
assert(
  titlesOf(selectFirstBatch(trap, 741)).join(",") ===
    ["prefecture:婺州", "prefecture:扬州", "prefecture:衢州", "prefecture:宣州"].sort().join(","),
  "741 prefecture 扬州 plus 宣/婺/衢, not 括州"
);
assert(
  !titlesOf(selectFirstBatch(trap, 1200)).some((t) => t.includes("处州")),
  "1200 does not include 处州"
);
const y1200 = titlesOf(selectFirstBatch(trap, 1200));
for (const name of ["扬州", "泰州", "高邮军", "宁国府", "婺州", "衢州"]) {
  assert(y1200.includes("prefecture:" + name), "1200 includes " + name);
}
assert(titlesOf(selectFirstBatch(trap, -403)).join(",") === "polity:越", "−403 is polity 越 only");
assert(
  selectFirstBatch(trap, -403).features[0].properties.role === "polity",
  "越 is marked polity, not a prefecture face"
);
assert(selectFirstBatch(trap, 2026).features.length === 0, "modern year has no batch");
assert(
  selectFirstBatch(
    { type: "FeatureCollection", features: [feat("prefecture", "广陵国", { source_year: 440 })] },
    -100
  ).features.length === 0,
  "source_year mismatch is dropped"
);

for (const [year, specs] of Object.entries(FIRST_BATCH)) {
  for (const spec of specs) {
    assert(spec.layer !== "region", `${year} ${spec.title} must not be a region`);
    assert(!FORBIDDEN_TITLES.has(spec.title), `${year} allowlists forbidden ${spec.title}`);
  }
}
for (const banned of ["处州", "处州府", "括州", "会稽郡", "丹阳郡", "丹阳尹", "绍兴府"]) {
  const hit = Object.values(FIRST_BATCH).some((specs) => specs.some((s) => s.title === banned));
  assert(!hit, banned + " is not in the first batch");
}

assert(snapshotForEra("era-modern") == null, "modern snapshot is empty");
assert(snapshotForEra("era-chu-qinhan").year === -100, "秦汉 → −100");
assert(snapshotForEra("era-mingqing", 1820).year === 1820, "明清 can select 1820");
assert(snapshotForEra("era-mingqing", 1415).file.includes("1415"), "明清 default file is 明");
assert(snapshotForEra("era-preqin").kind === "polity", "先秦 snapshot is polity");

const off = readOverlayFlag("", null);
assert(off.enabled === false && off.revealed === false, "default off and control hidden");
const on = readOverlayFlag("?overlay=jiangshan", null);
assert(on.enabled && on.revealed && on.persist === "jiangshan", "query enables");
const forcedOff = readOverlayFlag("?overlay=off", "jiangshan");
assert(!forcedOff.enabled && forcedOff.persist === "", "query off beats storage");
const stored = readOverlayFlag("", "jiangshan");
assert(stored.enabled && stored.revealed && stored.persist == null, "storage enables without rewriting");
assert(!readOverlayFlag("?overlay=jiangshan-extra", null).enabled, "overlay value is exact");

assert(describeOverlay(null, []).includes("近代"), "modern status");
assert(describeOverlay(-100, selectFirstBatch(trap, -100).features).includes("广陵国"), "status names 广陵国");
assert(describeOverlay(-100, selectFirstBatch(trap, -100).features).includes("刺史部"), "status warns about Han 扬州");

const src = readFileSync(new URL("../js/jiangshan-overlay.mjs", import.meta.url), "utf8");
assert(!/https?:\/\//.test(src), "overlay module must not fetch a remote URL");
assert(src.includes(DATA_DIR), "overlay reads the local directory");

const data = JSON.parse(readFileSync("data/wuyue-map-data.json", "utf8"));
assert(data.meta.version === "0.8.19", "version bumped");
assert(String(data.meta.jiangshanOverlay || "").includes("默认关"), "meta notes default off");
assert(
  data.eras.map((e) => e.id).join(",") ===
    "era-preqin,era-chu-qinhan,era-weijin,era-tang-nbsong,era-southern-song,era-mingqing,era-modern",
  "era ids unchanged"
);

const expectedFiles = Object.values(ERA_SNAPSHOTS).flat().map((s) => DATA_DIR + s.file);
const present = expectedFiles.filter((p) => existsSync(p));
if (!present.length) {
  console.log("SKIP local pack (no geojson in " + DATA_DIR + ")");
} else {
  assert(present.length === expectedFiles.length, "partial pack: " + expectedFiles.filter((p) => !existsSync(p)).join(", "));
  for (const snap of Object.values(ERA_SNAPSHOTS).flat()) {
    const path = DATA_DIR + snap.file;
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const out = selectFirstBatch(raw, snap.year);
    const got = titlesOf(out);
    const want = FIRST_BATCH[String(snap.year)].map((s) => `${s.layer}:${s.title}`).sort();
    assert(got.join(",") === want.join(","), `${snap.file} got ${got.join(",")} want ${want.join(",")}`);
    assert(out.features.every((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")), snap.file + " geometry");
    assert(!out.features.some((f) => f.properties.layer === "region"), snap.file + " has a region face");
    for (const f of out.features) {
      const pt = f.properties.anchor;
      assert(Array.isArray(pt) && pt[0] > 100 && pt[0] < 140 && pt[1] > 20 && pt[1] < 45, snap.file + " " + f.properties.title + " anchor");
    }
    try {
      const ignored = execSync(`git check-ignore -- ${JSON.stringify(path)}`, { encoding: "utf8" }).trim();
      assert(ignored.length > 0, path + " is gitignored");
    } catch (err) {
      assert(false, path + " is not gitignored");
    }
  }
  try {
    execSync("git check-ignore -- local/jiangshan-overlay/README.md", { encoding: "utf8" });
    assert(false, "README must stay tracked");
  } catch (err) {
    if (err.status !== 1) assert(false, "git check-ignore README failed unexpectedly");
  }
}

if (failed) {
  console.error(failed + " assertion(s) failed");
  process.exit(1);
}
console.log("ok");
