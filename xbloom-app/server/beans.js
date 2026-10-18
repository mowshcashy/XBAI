// Bean memory ("豆子记忆" from the coffee-brewing skill) — every dialed-in bean
// is saved locally so the assistant can recall it next time the same coffee appears.

const fs = require("node:fs");
const path = require("node:path");

const STORE_DIR = process.env.XBLOOM_STORE_DIR || path.join(__dirname, "..", ".data");
const STORE_FILE = path.join(STORE_DIR, "beans.json");

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(beans) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(beans, null, 2), { mode: 0o600 });
}

// Upsert by name (case-insensitive) — keeps the store idempotent.
function remember(bean) {
  const beans = load();
  const nameKey = String(bean?.name || "").trim().toLowerCase();
  if (!nameKey) throw new Error("Bean name is required.");
  const clean = {
    name: String(bean.name).trim().slice(0, 80),
    origin: String(bean.origin || "").slice(0, 80),
    process: String(bean.process || "").slice(0, 40),
    roast: String(bean.roast || "").slice(0, 40),
    notes: String(bean.notes || "").slice(0, 300),
    recipe: bean.recipe || null,
    dialed_at: new Date().toISOString(),
  };
  const idx = beans.findIndex((b) => String(b.name).trim().toLowerCase() === nameKey);
  if (idx >= 0) beans[idx] = { ...beans[idx], ...clean, updated_at: new Date().toISOString() };
  else beans.push({ ...clean, updated_at: clean.dialed_at });
  save(beans);
  return clean;
}

// Free-text lookup so the assistant can find "that Ethiopian" without exact names.
function find(query) {
  const q = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!q.length) return [];
  return load()
    .map((b) => {
      const hay = [b.name, b.origin, b.process, b.roast, b.notes].join(" ").toLowerCase();
      const score = q.reduce((a, term) => a + (hay.includes(term) ? 1 : 0), 0);
      return { b, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, z) => z.score - a.score)
    .map((x) => x.b);
}

module.exports = { load, remember, find, STORE_FILE };
