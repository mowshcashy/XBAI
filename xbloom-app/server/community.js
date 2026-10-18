// Community recipes store — shared recipes browsable by all local users.
const fs = require("node:fs");
const path = require("node:path");

const STORE_DIR = process.env.XBLOOM_STORE_DIR || path.join(__dirname, "..", ".data");
const COMMUNITY_FILE = path.join(STORE_DIR, "community.json");

const SEED = [
  {
    id: "seed-1",
    name: "Ethiopian Yirgacheffe Natural",
    kind: "coffee",
    author: "CoffeeLover42",
    origin: "Ethiopia",
    region: "Yirgacheffe",
    process: "natural",
    roast: "light",
    company: "Nordic Roasters",
    dose_g: 15,
    ratio: 15,
    grind_size: 62,
    grind_rpm: 80,
    color: "#D4BFA0",
    notes: "Bright and fruity with blueberry notes. Natural process adds a wine-like complexity. Bloom is extended for fresh CO2 release.",
    pours: [
      { name: "Bloom", volume_ml: 38, temperature_c: 94, pattern: "circular", pause_seconds: 45, agitate_before: false, agitate_after: true },
      { name: "Pour 2", volume_ml: 87, temperature_c: 94, pattern: "spiral", pause_seconds: 30, agitate_before: false, agitate_after: false },
      { name: "Pour 3", volume_ml: 100, temperature_c: 94, pattern: "circular", pause_seconds: 0, agitate_before: false, agitate_after: false },
    ],
    likes: 14,
    createdAt: "2025-01-10T10:00:00Z",
  },
  {
    id: "seed-2",
    name: "Colombian Huila Washed",
    kind: "coffee",
    author: "BrewMaster",
    origin: "Colombia",
    region: "Huila",
    process: "washed",
    roast: "medium",
    company: "Blue Bottle",
    dose_g: 15,
    ratio: 16,
    grind_size: 72,
    grind_rpm: 80,
    color: "#B9C4D8",
    notes: "Clean, balanced, caramel sweetness. Classic Colombian pour-over. Washed process gives clarity and brightness.",
    pours: [
      { name: "Bloom", volume_ml: 38, temperature_c: 91, pattern: "circular", pause_seconds: 40, agitate_before: false, agitate_after: false },
      { name: "Pour 2", volume_ml: 102, temperature_c: 91, pattern: "circular", pause_seconds: 20, agitate_before: false, agitate_after: false },
      { name: "Pour 3", volume_ml: 100, temperature_c: 91, pattern: "circular", pause_seconds: 0, agitate_before: false, agitate_after: false },
    ],
    likes: 9,
    createdAt: "2025-01-15T12:00:00Z",
  },
  {
    id: "seed-3",
    name: "Japanese Sencha Green",
    kind: "tea",
    author: "TeaCeremony",
    origin: "Japan",
    region: "Shizuoka",
    process: "steamed",
    roast: null,
    company: "Ippodo",
    dose_g: 4,
    ratio: 17,
    color: "#A8C686",
    notes: "Umami-rich Japanese sencha. Lower temperature preserves sweetness and avoids bitterness. Three steeps for full extraction.",
    steeps: [
      { volume_ml: 70, temperature_c: 72, steep_seconds: 60 },
      { volume_ml: 70, temperature_c: 74, steep_seconds: 30 },
      { volume_ml: 70, temperature_c: 78, steep_seconds: 45 },
    ],
    likes: 7,
    createdAt: "2025-01-20T08:00:00Z",
  },
  {
    id: "seed-4",
    name: "Brazilian Dark Roast",
    kind: "coffee",
    author: "DarkRoastFan",
    origin: "Brazil",
    region: "Cerrado",
    process: "natural",
    roast: "dark",
    company: "Stumptown",
    dose_g: 18,
    ratio: 14,
    grind_size: 88,
    grind_rpm: 75,
    color: "#6F4E37",
    notes: "Chocolate and nut forward. Lower ratio for strength, cooler water to avoid over-extraction of dark roast.",
    pours: [
      { name: "Bloom", volume_ml: 45, temperature_c: 87, pattern: "centered", pause_seconds: 25, agitate_before: false, agitate_after: false },
      { name: "Pour 2", volume_ml: 100, temperature_c: 87, pattern: "circular", pause_seconds: 0, agitate_before: false, agitate_after: false },
      { name: "Pour 3", volume_ml: 107, temperature_c: 87, pattern: "circular", pause_seconds: 0, agitate_before: false, agitate_after: false },
    ],
    likes: 11,
    createdAt: "2025-01-25T14:00:00Z",
  },
  {
    id: "seed-5",
    name: "Kenyan AA Washed Light",
    kind: "coffee",
    author: "AcidityFan",
    origin: "Kenya",
    region: "Kirinyaga",
    process: "washed",
    roast: "light",
    company: "Counter Culture",
    dose_g: 14,
    ratio: 16,
    grind_size: 60,
    grind_rpm: 85,
    color: "#C9A9A9",
    notes: "Intense blackcurrant and tomato. Kenyan AA needs fine grind and high temp for full extraction of its dense beans.",
    pours: [
      { name: "Bloom", volume_ml: 35, temperature_c: 95, pattern: "circular", pause_seconds: 45, agitate_before: false, agitate_after: true },
      { name: "Pour 2", volume_ml: 75, temperature_c: 95, pattern: "spiral", pause_seconds: 30, agitate_before: false, agitate_after: false },
      { name: "Pour 3", volume_ml: 75, temperature_c: 94, pattern: "spiral", pause_seconds: 20, agitate_before: false, agitate_after: false },
      { name: "Pour 4", volume_ml: 39, temperature_c: 93, pattern: "circular", pause_seconds: 0, agitate_before: false, agitate_after: false },
    ],
    likes: 6,
    createdAt: "2025-02-01T09:00:00Z",
  },
  {
    id: "seed-6",
    name: "Taiwanese High Mountain Oolong",
    kind: "tea",
    author: "TeaMaster88",
    origin: "Taiwan",
    region: "Ali Shan",
    process: "partially_oxidized",
    roast: null,
    company: "Ten Ren",
    dose_g: 5,
    ratio: 14,
    color: "#D9C9A8",
    notes: "Floral and creamy Ali Shan oolong. Three short steeps to build complexity. Ceramic gaiwan style adapted for XBloom.",
    steeps: [
      { volume_ml: 70, temperature_c: 90, steep_seconds: 45 },
      { volume_ml: 70, temperature_c: 92, steep_seconds: 60 },
      { volume_ml: 70, temperature_c: 94, steep_seconds: 90 },
    ],
    likes: 5,
    createdAt: "2025-02-05T11:00:00Z",
  },
];

function load() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  try {
    return JSON.parse(fs.readFileSync(COMMUNITY_FILE, "utf8"));
  } catch {
    fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(SEED, null, 2));
    return [...SEED];
  }
}

function save(recipes) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(recipes, null, 2));
}

function list(filters = {}) {
  let recipes = load();
  if (filters.kind && filters.kind !== "all") recipes = recipes.filter((r) => r.kind === filters.kind);
  if (filters.origin) recipes = recipes.filter((r) => (r.origin || "").toLowerCase().includes(filters.origin.toLowerCase()));
  if (filters.process && filters.process !== "all") recipes = recipes.filter((r) => r.process === filters.process);
  if (filters.roast && filters.roast !== "all") recipes = recipes.filter((r) => r.roast === filters.roast);
  if (filters.company) recipes = recipes.filter((r) => (r.company || "").toLowerCase().includes(filters.company.toLowerCase()));
  return recipes.sort((a, b) => (b.likes || 0) - (a.likes || 0));
}

function publish(recipe, email) {
  const recipes = load();
  const author = email ? email.split("@")[0] : "Anonymous";
  const existing = recipes.find((r) => r.id !== r.id?.startsWith("seed") && r.name === recipe.name && r.author === author);
  if (existing) {
    Object.assign(existing, { ...recipe, author, id: existing.id, likes: existing.likes });
    save(recipes);
    return existing;
  }
  const entry = { ...recipe, id: `user-${Date.now()}`, author, likes: 0, createdAt: new Date().toISOString() };
  recipes.unshift(entry);
  save(recipes);
  return entry;
}

function like(id) {
  const recipes = load();
  const r = recipes.find((x) => x.id === id);
  if (!r) return null;
  r.likes = (r.likes || 0) + 1;
  save(recipes);
  return r;
}

module.exports = { list, publish, like };
