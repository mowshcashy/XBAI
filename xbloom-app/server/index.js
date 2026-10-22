// Local dashboard for the XBloom MCP — Express + static UI.
// Three ways to build a recipe: chat with a local Ollama model, fill the form by hand,
// or import from a share link. Everything talks to XBloom through server/xbloom.js.

const path = require("node:path");
// Secrets (OLLAMA_API_KEY, OPENROUTER_API_KEY…) live in xbloom-app/.env, which git ignores
try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch { /* no .env */ }
const express = require("express");

const xbloom = require("./xbloom");
const brew   = require("./brew");
const ollama = require("./ollama"); // VISION_MODELS exposed for /api/assist
const openrouter = require("./openrouter");
const store = require("./store");
const community = require("./community");
const { SYSTEM_PROMPT, RECIPE_SCHEMA } = require("./prompt");
const { isIcedRequest, applyIcedRules } = require("./iced");
const beans = require("./beans");

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "15mb" }));
// No HTTP caching so the browser always picks up the latest files.
app.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use(express.static(path.join(__dirname, "..", "public")));

const route = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    // A rejected token means the saved session is dead — forget it so the UI asks to sign in again
    if (e.status === 401 && store.load()?.token) store.clear();
    if (!res.headersSent) res.status(e.status || 500).json({ error: String(e.message || e) });
    else res.end();
  });

function requireCreds() {
  const creds = store.load();
  if (!creds?.token) {
    const err = new Error("Not logged in. Sign in with your XBloom account first.");
    err.status = 401;
    throw err;
  }
  return creds;
}

// --- session ---

app.get("/api/session", (req, res) => {
  const creds = store.load();
  res.json({ loggedIn: !!creds?.token, email: creds?.email ?? null });
});

app.post("/api/login", route(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  const creds = await xbloom.login(email, password);
  store.save(creds);
  res.json({ ok: true, email: creds.email });
}));

app.post("/api/logout", (req, res) => { store.clear(); res.json({ ok: true }); });

// --- recipes ---

app.get("/api/recipes", route(async (req, res) => {
  res.json({ recipes: await xbloom.listRecipes(requireCreds()) });
}));

app.post("/api/recipes", route(async (req, res) => {
  const spec = req.body || {};
  if (!spec.name) return res.status(400).json({ error: "A recipe name is required." });
  res.json(await xbloom.addRecipe(requireCreds(), spec));
}));

app.put("/api/recipes/:id", route(async (req, res) => {
  res.json(await xbloom.updateRecipe(requireCreds(), req.params.id, req.body || {}));
}));

app.delete("/api/recipes/:id", route(async (req, res) => {
  res.json(await xbloom.deleteRecipe(requireCreds(), req.params.id));
}));

// --- BLE brew ---

app.get("/api/ble/status", route(async (req, res) => {
  const installed = await brew.checkInstalled();
  res.json({ installed });
}));

// SSE stream: POST /api/brew
// Body: recipe spec (same shape as /api/recipes).
// Streams log lines then {type:"done"} or {type:"error",...}.
app.post("/api/brew", (req, res) => {
  const spec = req.body || {};
  if (!spec.name) return res.status(400).json({ error: "Recipe name required." });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const { address } = req.query;
  brew.brewNow(spec, {
    onChunk: (line) => send({ type: "log", line }),
    address: address || undefined,
  }).then(() => {
    send({ type: "done" });
    res.end();
  }).catch((err) => {
    send({ type: "error", message: err.message || String(err) });
    res.end();
  });
});

app.post("/api/import", route(async (req, res) => {
  const { share_url } = req.body || {};
  if (!share_url) return res.status(400).json({ error: "A share URL is required." });
  res.json(await xbloom.fetchSharedRecipe(share_url));
}));

// --- ollama ---

app.get("/api/ollama/models", route(async (req, res) => {
  try {
    res.json({ models: await ollama.listModels(), url: ollama.OLLAMA_URL, default: ollama.DEFAULT_MODEL, cloud: ollama.CLOUD });
  } catch (e) {
    res.status(503).json({ error: `Could not reach Ollama at ${ollama.OLLAMA_URL}. Is it running?`, detail: String(e.message || e) });
  }
}));

// --- recipe normalization ---
// Whatever the model returns, clamp it into valid XBloom hardware ranges so the
// UI and the cloud API can never receive an impossible value.

function normalizeRecipe(r) {
  if (!r || typeof r !== "object") return null;

  let kind = String(r.kind || "").toLowerCase();
  if (kind !== "tea" && kind !== "coffee") {
    kind = Array.isArray(r.steeps) && r.steeps.length ? "tea" : "coffee";
  }

  const clamp = (v, lo, hi, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const name = (typeof r.name === "string" && r.name.trim()) ? r.name.trim().slice(0, 60) : "New Recipe";
  let color = typeof r.color === "string" ? r.color.trim() : "";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = kind === "tea" ? "#A8C686" : "#B9C4D8";
  const notes = typeof r.notes === "string" ? r.notes.slice(0, 600) : "";

  if (kind === "coffee") {
    let pours = Array.isArray(r.pours) ? r.pours : [];
    if (!pours.length && Array.isArray(r.steeps)) pours = r.steeps;
    pours = pours.slice(0, 7).map((p, i) => ({
      name: (typeof p?.name === "string" && p.name.trim()) ? p.name.trim() : (i === 0 ? "Bloom" : `Pour ${i + 1}`),
      volume_ml: clamp(p?.volume_ml, 1, 400, 30),
      temperature_c: clamp(p?.temperature_c, 40, 95, 93),
      pattern: ["centered", "circular", "spiral"].includes(p?.pattern) ? p.pattern : "circular",
      flow_rate: Number(clamp(p?.flow_rate, 3.0, 3.5, 3.2).toFixed(2)),
      pause_seconds: Math.round(clamp(p?.pause_seconds, 0, 255, i === 0 ? 45 : 0)),
      agitate_before: !!p?.agitate_before,
      agitate_after: !!p?.agitate_after,
    }));
    if (!pours.length) return null;

    const dose = clamp(r.dose_g, 1, 31, 15);
    const ratio = clamp(r.ratio, 8, 20, 16);
    // auto-balance volumes if they are far off the target total
    const target = dose * ratio;
    const sum = pours.reduce((a, p) => a + p.volume_ml, 0);
    if (target > 0 && sum > 0 && Math.abs(sum - target) / target > 0.05) {
      const factor = target / sum;
      pours = pours.map((p) => ({ ...p, volume_ml: Math.max(1, Math.round(p.volume_ml * factor)) }));
    }
    return {
      kind, name, dose_g: dose, ratio,
      grind_size: Math.round(clamp(r.grind_size, 40, 120, 70)),
      grind_rpm: Math.round(clamp(r.grind_rpm, 60, 120, 80)),
      color, pours, notes,
    };
  }

  // tea
  let steeps = Array.isArray(r.steeps) ? r.steeps : [];
  if (!steeps.length && Array.isArray(r.pours)) {
    steeps = r.pours.map((p) => ({
      volume_ml: p?.volume_ml,
      temperature_c: p?.temperature_c,
      steep_seconds: p?.steep_seconds ?? p?.pause_seconds,
      flow_rate: p?.flow_rate,
    }));
  }
  // If the model wrongly put dose_g inside steeps, recover the total. Repeated
  // values mean the full dose was echoed per steep (take max); genuinely split
  // values only happen with very small leaves, where sum is the right answer —
  // use max because repeating the total is far more common.
  const steepDoses = steeps.map((s) => Number(s?.dose_g)).filter((n) => Number.isFinite(n) && n > 0);
  let dose = clamp(r.dose_g, 1, 10, 5);
  if (!Number.isFinite(Number(r.dose_g)) && steepDoses.length) {
    dose = clamp(Math.max(...steepDoses), 1, 10, 5);
  }
  steeps = steeps.slice(0, 3).map((s, i) => ({
    volume_ml: clamp(s?.volume_ml, 1, 90, 80),
    temperature_c: clamp(s?.temperature_c, 65, 100, 85),
    steep_seconds: Math.round(clamp(s?.steep_seconds, 0, 360, 120)),
    flow_rate: Number(clamp(s?.flow_rate, 3.0, 3.5, 3.0).toFixed(2)),
  }));
  if (!steeps.length) return null;

  const totalWater = steeps.reduce((a, s) => a + s.volume_ml, 0);
  const ratio = Number.isFinite(Number(r.ratio)) && Number(r.ratio) > 0
    ? Number(clamp(r.ratio, 1, 99, 15).toFixed(1))
    : Number(Math.max(1, totalWater / dose).toFixed(1));

  return { kind, name, dose_g: dose, ratio, color, steeps, notes };
}

// Salvage the first balanced {...} block from otherwise messy model output.
function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// --- bean memory (from the coffee-brewing skill) ---

app.get("/api/beans", (req, res) => {
  const { q } = req.query || {};
  res.json({ beans: q ? beans.find(q) : beans.load() });
});

app.post("/api/beans", route(async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "A bean name is required." });
  res.json(beans.remember(b));
}));
// Turn the user's free-text request (optionally with an attached photo of the
// coffee/tea bag) into a structured recipe.
//
// Flow with an image:
//   1. Try the selected model if it is vision-capable, otherwise walk a list of
//      known vision models to read the label.
//   2. Stream that reading to the client so the user sees what was extracted.
//   3. Feed the label description + the user's message into the selected recipe
//      model and stream the JSON recipe as usual.
//   4. If every vision model fails, fall back to local OCR (tesseract.js).
//   5. If OCR fails too, continue with the user's text only.

const LABEL_PROMPT =
  "You are looking at a photo of a coffee or tea product. Read the label carefully and answer in English, as one compact paragraph: " +
  "product name, origin/country and region, variety, processing method, roast level (if visible), altitude, tasting notes, " +
  "any numbers (grams, ratio, temperature), and the type (coffee or tea). If a detail is not visible, skip it. Do not invent facts.";

function visionCandidateModels(selected, available) {
  const order = [];
  if (selected) order.push(selected);
  for (const m of ollama.VISION_MODELS) order.push(m);
  const avail = new Set(available || []);
  return order.filter((m, i) => m && order.indexOf(m) === i && (avail.size === 0 || avail.has(m)));
}

app.post("/api/assist", async (req, res) => {
  const { message, model, provider, history, image } = req.body || {};
  const useOpenRouter = provider === "openrouter";
  if (!message && !image) return res.status(400).json({ error: "A message or an image is required." });

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (obj) => res.write(JSON.stringify(obj) + "\n");
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });

  let label = "";
  const userText = String(message || "صمم لي وصفة من هذه الصورة");

  // ---- Step 1: read the attached photo ----
  if (image) {
    send({ type: "token", data: "جاري قراءة الصورة…\n\n" });

    if (useOpenRouter) {
      try {
        label = await openrouter.chat(
          [{ role: "user", content: LABEL_PROMPT }],
          { model, temperature: 0.1, image }
        );
        if (label && label.trim()) {
          send({ type: "token", data: `القراءة من الصورة (عبر OpenRouter):\n${label.trim()}\n\nجاري تصميم الوصفة…\n\n` });
        }
      } catch (e) {
        send({ type: "token", data: `OpenRouter vision فشل — أكمل بناءً على وصفك فقط.\n\n` });
      }
    } else {
      let available = [];
      try { available = await ollama.listModels(); } catch {}
      for (const vm of visionCandidateModels(model, available)) {
        try {
          label = await ollama.chat(
            [{ role: "user", content: LABEL_PROMPT }],
            { model: vm, temperature: 0.1, image }
          );
          if (label && label.trim()) {
            send({ type: "token", data: `القراءة من الصورة (عبر ${vm}):\n${label.trim()}\n\nجاري تصميم الوصفة…\n\n` });
            break;
          }
        } catch { /* try next */ }
        if (label && label.trim()) break;
      }
      if (!label || !label.trim()) {
        send({ type: "token", data: "موديلات الرؤية ما استجابت — أجرب OCR محلي…\n\n" });
        try {
          const { ocrImage } = require("./ocr");
          const text = await ocrImage(image);
          label = text ? `OCR text from the label:\n${text}` : "";
          if (label) send({ type: "token", data: `نص الملصق (OCR):\n${text}\n\nجاري تصميم الوصفة…\n\n` });
        } catch {
          send({ type: "token", data: `OCR فشل أيضاً — أكمل بناءً على وصفك فقط.\n\n` });
        }
      }
    }
  }

  // ---- Step 2: design the recipe with the selected model ----
  // Bean memory recall: if this coffee was dialed-in before, tell the model.
  let beanHint = "";
  try {
    const matches = beans.find(userText + " " + label).slice(0, 2);
    if (matches.length) {
      const known = matches.map((b) => `${b.name} (${[b.origin, b.process, b.roast].filter(Boolean).join(", ")}): ${JSON.stringify(b.recipe)}`).join(" | ");
      beanHint = `Known dialed-in bean from memory (prefer these values if it matches): ${known}\n\n`;
    }
  } catch {}

  const enriched = beanHint + (label
    ? `Photo label details:\n${label}\n\nUser request: ${userText}`
    : userText);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(Array.isArray(history) ? history.slice(-4) : []),
    { role: "user", content: enriched },
  ];

  if (beanHint) send({ type: "token", data: "وجدت الحبة في الذاكرة — أستخدم الإعدادات المضبوطة سابقاً.\n\n" });

  let raw = "";
  try {
    if (useOpenRouter) {
      raw = await openrouter.chatStream(
        messages,
        { model, temperature: 0.4 },
        (token) => send({ type: "token", data: token }),
        abort.signal,
      );
    } else {
      raw = await ollama.chatStream(
        messages,
        { model, temperature: 0.4, format: RECIPE_SCHEMA },
        (token) => send({ type: "token", data: token }),
        abort.signal,
      );
    }
  } catch (e) {
    if (abort.signal.aborted) { try { res.end(); } catch {} return; }
    send({ type: "error", error: `${useOpenRouter ? "OpenRouter" : "Ollama"} error: ${String(e.message || e)}` });
    res.end();
    return;
  }

  let parsed = extractJson(raw);
  let recipe = parsed ? normalizeRecipe(parsed) : null;

  if (!recipe) {
    send({ type: "token", data: "\n\nجاري تصحيح الصيغة…" });
    try {
      const repairMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: enriched },
        { role: "assistant", content: raw },
        { role: "user", content: "أجب بـ JSON خام فقط: كائن واحد بين أقواس معقوفة، بدون أي نص أو markdown." },
      ];
      const repair = useOpenRouter
        ? await openrouter.chat(repairMessages, { model, temperature: 0.1 })
        : await ollama.chat(repairMessages, { model, temperature: 0.1, format: RECIPE_SCHEMA });
      recipe = normalizeRecipe(extractJson(repair));
    } catch {}
  }

  if (recipe && recipe.kind === "coffee" && isIcedRequest(userText, recipe.name, recipe.notes)) {
    recipe = applyIcedRules(recipe);
  }

  if (!recipe) send({ type: "error", error: "تعذّر توليد وصفة صالحة. جرّب موديل آخر أو أعد المحاولة." });
  else {
    send({ type: "recipe", recipe });
    // Learn: remember a coffee when the user explicitly names it (dialed-in learning).
    try {
      const named = /اسم\s*(?:الحبة|القهوة)?[:：]?\s*([^\n,.]{2,60})/i.exec(userText) || (label ? /^([^|\n]{2,60})$/m.exec(label) : null);
      if (named) {
        beans.remember({
          name: named[1].trim(),
          origin: (label.match(/origin[:\s]+([A-Za-z ]{3,30})/i) || [])[1] || "",
          process: (label.match(/(washed|natural|honey|anaerobic)/i) || [])[1] || "",
          roast: recipe.roast || (label.match(/(light|medium|dark)\s*roast/i) || [])[1] || "",
          notes: recipe.notes || "",
          recipe,
        });
        send({ type: "token", data: "\n\nحفظت الحبة في الذاكرة ✓" });
      }
    } catch {}
  }
  res.end();
});

// --- community ---

app.get("/api/community", (req, res) => {
  const { kind, origin, process: proc, roast, company } = req.query || {};
  res.json({ recipes: community.list({ kind, origin, process: proc, roast, company }) });
});

app.post("/api/community/publish", route(async (req, res) => {
  const creds = store.load();
  const recipe = req.body || {};
  if (!recipe.name) return res.status(400).json({ error: "Recipe name required." });
  const entry = community.publish(recipe, creds?.email);
  res.json(entry);
}));

app.post("/api/community/:id/like", (req, res) => {
  const r = community.like(req.params.id);
  if (!r) return res.status(404).json({ error: "Recipe not found." });
  res.json(r);
});

// --- openrouter ---

app.get("/api/openrouter/models", route(async (req, res) => {
  try {
    res.json({ models: await openrouter.listModels(), hasKey: openrouter.hasKey() });
  } catch (e) {
    res.status(503).json({ error: String(e.message || e), hasKey: openrouter.hasKey() });
  }
}));

app.listen(PORT, () => {
  console.log(`\n  XBloom dashboard  ->  http://localhost:${PORT}`);
  console.log(`  Ollama endpoint   ->  ${ollama.OLLAMA_URL}${ollama.CLOUD ? " (cloud, API key set)" : ""}`);
  console.log(`  Default AI model  ->  ${ollama.DEFAULT_MODEL}`);
  console.log(`  OpenRouter key    ->  ${openrouter.hasKey() ? "✓ set" : "not set (cloud AI disabled)"}`);
  console.log(`  Session file      ->  ${store.STORE_FILE}\n`);
});
