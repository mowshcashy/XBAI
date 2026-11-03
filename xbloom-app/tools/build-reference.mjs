// Build public/reference-recipes.json from the roasters' recipe sheet.
//
//   1. Export the .xlsx to JSON (one array of rows per sheet), e.g. with openpyxl.
//   2. node tools/build-reference.mjs <sheet.json>
//
// Each row's XBloom share link is fetched once to add what the sheet lacks:
// grind size, grinder RPM, pour pattern, flow rate and agitation.

import { readFile, writeFile } from "node:fs/promises";

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node tools/build-reference.mjs <sheet.json>"); process.exit(1); }
const OUT = new URL("../public/reference-recipes.json", import.meta.url);
const PATTERN = { 1: "centered", 2: "spiral", 3: "circular" };

const sheets = JSON.parse(await readFile(SRC, "utf8"));
const [header, ...rows] = sheets["الوصفات"];
const col = (name) => header.indexOf(name);
const C = {
  roaster: col("المحمصة"), name: col("اسم الوصفة"), author: col("صاحب الوصفة"), approved: col("معتمدة من المحمصة"),
  serve: col("النوع"), tool: col("الأداة"), dose: col("البن (جم)"), ice: col("الثلج (جم)"), water: col("الماء (مل)"),
  pours: col("تفاصيل الصبات"), date: col("تاريخ الإضافة"), link: col("رابط xBloom"),
};

// "Bloom: 39مل @93.6° (34ث) | Pour 2: 101مل @93.6° (15ث)"
function parsePours(s) {
  return String(s || "").split("|").map((p) => {
    const m = p.match(/(\d+(?:\.\d+)?)\s*مل\s*@\s*(\d+(?:\.\d+)?)°\s*\((\d+)ث\)/);
    return m ? { v: Number(m[1]), t: Number(m[2]), p: Number(m[3]) } : null;
  }).filter(Boolean);
}

async function detail(link) {
  const id = new URL(link).searchParams.get("id");
  if (!id) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch("https://client-api.xbloom.com/RecipeDetail.html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableIdOfRSA: id, interfaceVersion: 19700101, skey: "testskey" }),
        signal: AbortSignal.timeout(12000),
      });
      const j = await resp.json();
      return j.result === "success" ? j.recipeVo : null;
    } catch { await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); }
  }
  return null;
}

const seen = new Set();
const base = [];
for (const r of rows) {
  const link = r[C.link];
  const key = link || `${r[C.roaster]}|${r[C.name]}`;
  if (!r[C.name] || seen.has(key)) continue;
  seen.add(key);
  base.push(r);
}

const out = [];
let next = 0, ok = 0;
async function worker() {
  while (next < base.length) {
    const r = base[next++];
    const pours = parsePours(r[C.pours]);
    const v = r[C.link] ? await detail(r[C.link]) : null;
    if (v) ok++;
    const detailPours = v?.pourList || [];
    out.push({
      roaster: r[C.roaster] || "",
      name: String(r[C.name]).trim(),
      author: r[C.author] || "",
      approved: r[C.approved] === "نعم",
      serve: r[C.serve] === "بارد" ? "iced" : "hot",
      tool: r[C.tool] || "",
      dose: Number(r[C.dose]) || null,
      ice: Number(r[C.ice]) || 0,
      water: Number(r[C.water]) || pours.reduce((a, p) => a + p.v, 0),
      grind: v?.grinderSize ?? null,
      rpm: v?.rpm ?? null,
      color: v?.theColor ?? null,
      tea: Number(v?.cupType) === 4,
      pours: pours.map((p, i) => {
        const d = detailPours[i] || {};
        return {
          v: p.v, t: p.t, p: p.p,
          pat: PATTERN[Number(d.pattern)] || "circular",
          flow: Number(d.flowRate) || 3,
          ag: Number(d.isEnableVibrationBefore) === 1 || Number(d.isEnableVibrationAfter) === 1,
        };
      }),
      date: r[C.date] || null,
      link: r[C.link] || null,
    });
    if (out.length % 50 === 0) console.log(`${out.length}/${base.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

out.sort((a, b) => (b.approved - a.approved) || a.roaster.localeCompare(b.roaster, "ar") || a.name.localeCompare(b.name, "ar"));
await writeFile(OUT, JSON.stringify(out));
console.log(`wrote ${out.length} recipes (${ok} enriched from share links) → ${OUT.pathname}`);
