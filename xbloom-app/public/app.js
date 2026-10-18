// XBloom dashboard front-end. Vanilla JS, no build step.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const PATTERN_LABELS = { circular: "دائري", centered: "مركزي", spiral: "حلزوني" };
const ROAST_LABELS = { light: "فاتح", medium: "متوسط", dark: "غامق" };
const PROCESS_LABELS = { washed: "مغسول", natural: "طبيعي", honey: "عسل", anaerobic: "لاهوائي", steamed: "مبخّر", partially_oxidized: "أكسدة جزئية" };
let state = { preview: null, history: [], provider: "ollama" };

// ============================================================
// STATIC MODE — detect if running on GitHub Pages / remote host
// ============================================================
const IS_STATIC = !["localhost", "127.0.0.1", ""].includes(location.hostname) && !location.hostname.endsWith(".local");

// ============================================================
// SETTINGS — loaded from localStorage, applied on boot
// ============================================================
const DEFAULT_ACCENT = "#f26b1d";
const settings = {
  name: "",
  orKey: "",
  ollamaUrl: "http://localhost:11434",
  accent: DEFAULT_ACCENT,
};

function loadSettings() {
  settings.name = localStorage.getItem("xbloom.s.name") || "";
  settings.orKey = localStorage.getItem("xbloom.s.orKey") || "";
  settings.ollamaUrl = localStorage.getItem("xbloom.s.ollamaUrl") || "http://localhost:11434";
  const savedAccent = localStorage.getItem("xbloom.s.accent");
  settings.accent = savedAccent && savedAccent !== "#9ab5d9" ? savedAccent : DEFAULT_ACCENT;
  applyAccent(settings.accent);
  updateSidebarProfile();
  if (IS_STATIC) $("#staticNote")?.classList.remove("hidden");
}

function applyAccent(hex) {
  const r = parseInt(hex.slice(1, 3), 16) || 242;
  const g = parseInt(hex.slice(3, 5), 16) || 107;
  const b = parseInt(hex.slice(5, 7), 16) || 29;
  const lift = (c) => Math.round(c + (255 - c) * 0.32);
  const root = document.documentElement.style;
  root.setProperty("--accent", hex);
  root.setProperty("--accent-2", `rgb(${lift(r)},${lift(g)},${lift(b)})`);
  root.setProperty("--accent-faint", `rgba(${r},${g},${b},0.18)`);
}

function updateSidebarProfile() {
  if (settings.name) {
    const lbl = $("#sessionLabel");
    const av = $("#avatarInitial");
    if (lbl && !$("#logoutBtn")?.classList.contains("hidden") === false) {
      // only override when not logged into XBloom cloud
    }
    if (av && av.textContent === "?") {
      av.textContent = settings.name[0].toUpperCase();
    }
  }
}

// Settings panel UI
function initSettingsPanel() {
  const nameEl = $("#settingName");
  const orKeyEl = $("#settingOrKey");
  const ollamaEl = $("#settingOllamaUrl");
  const accentEl = $("#settingAccent");
  if (!nameEl) return;

  // populate inputs from settings
  nameEl.value = settings.name;
  orKeyEl.value = settings.orKey;
  ollamaEl.value = settings.ollamaUrl;
  accentEl.value = settings.accent;

  // color swatches
  $$(".color-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.accent === settings.accent);
    btn.addEventListener("click", () => {
      accentEl.value = btn.dataset.accent;
      applyAccent(btn.dataset.accent);
      $$(".color-swatch").forEach((b) => b.classList.toggle("active", b.dataset.accent === btn.dataset.accent));
    });
  });

  // live preview while dragging color picker
  accentEl.addEventListener("input", () => {
    applyAccent(accentEl.value);
    $$(".color-swatch").forEach((b) => b.classList.remove("active"));
  });

  // go-to-settings from OR banner
  $("#orKeyGoSettings")?.addEventListener("click", () => showPanel("settings"));

  // save
  $("#saveSettingsBtn").addEventListener("click", () => {
    settings.name = nameEl.value.trim();
    settings.orKey = orKeyEl.value.trim();
    settings.ollamaUrl = ollamaEl.value.trim() || "http://localhost:11434";
    settings.accent = accentEl.value;
    localStorage.setItem("xbloom.s.name", settings.name);
    localStorage.setItem("xbloom.s.orKey", settings.orKey);
    localStorage.setItem("xbloom.s.ollamaUrl", settings.ollamaUrl);
    localStorage.setItem("xbloom.s.accent", settings.accent);
    applyAccent(settings.accent);
    updateSidebarProfile();
    toast("تم حفظ الإعدادات ✓");
    // refresh models if provider is active
    loadModels();
  });
}

// --- helpers ---

// On GitHub Pages without an XBloom login, recipes live in this browser only.
const useLocalStore = () => IS_STATIC && !window.XBWeb?.loggedIn();

async function api(path, opts = {}) {
  if (IS_STATIC && window.XBWeb) {
    const out = await window.XBWeb.route(path, opts);
    if (out !== null) return out;
  }
  const resp = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || `HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(msg, kind = "ok") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3800);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function clampN(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

// --- panels ---

function heroBackground(color) {
  return `radial-gradient(120% 140% at 0% 0%, ${color}66, transparent 55%), radial-gradient(90% 120% at 100% 100%, rgba(242,107,29,.45), transparent 60%), linear-gradient(135deg, #3a2215, #1a110c)`;
}

function showPanel(name) {
  document.querySelectorAll(".panel").forEach((p) => {
    const on = p.id === `panel-${name}`;
    p.classList.toggle("active", on);
    p.style.display = on ? "" : "none";
  });
  document.querySelectorAll(".mod-card").forEach((t) => t.classList.toggle("active", t.dataset.goto === name));
  document.querySelectorAll(".mnav-btn").forEach((t) => t.classList.toggle("active", t.dataset.goto === name));
  if (name === "recipes") loadRecipes();
  if (name === "community") loadCommunity();
  if (name === "home") populateHomeGrid();
}
document.querySelectorAll(".mod-card").forEach((t) =>
  t.addEventListener("click", () => showPanel(t.dataset.goto))
);
document.querySelectorAll(".mnav-btn").forEach((t) =>
  t.addEventListener("click", () => showPanel(t.dataset.goto))
);
$$("#panel-home [data-goto]").forEach((el) =>
  el.addEventListener("click", () => showPanel(el.dataset.goto))
);

// --- mobile home panel ---

let homeRecipes = [];

async function fetchRecipesForHome() {
  if (useLocalStore()) return JSON.parse(localStorage.getItem("xbloom.recipes") || "[]");
  return (await api("/api/recipes").catch(() => ({ recipes: [] }))).recipes || [];
}

const recipeKind = (r) => ((r.cup_type || r.kind) === "tea" ? "tea" : "coffee");
const asSpec = (r) => normalizeRecipe({ ...r, kind: recipeKind(r), steeps: r.steeps || (recipeKind(r) === "tea" ? r.pours : undefined) });

function renderHomeStats(recipes) {
  const tea = recipes.filter((r) => recipeKind(r) === "tea").length;
  const coffee = recipes.length - tea;
  const pct = (n) => (recipes.length ? `${Math.round((n / recipes.length) * 100)}%` : "0%");
  const ratios = recipes.map((r) => Number(r.ratio)).filter((n) => n > 0);
  const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  $("#statTotal").textContent = recipes.length;
  $("#statCoffee").textContent = coffee;
  $("#statTea").textContent = tea;
  $("#statRatio").textContent = avg ? `1:${avg.toFixed(1).replace(/\.0$/, "")}` : "—";
  $("#statCoffeeBadge").textContent = pct(coffee);
  $("#statTeaBadge").textContent = pct(tea);
  $("#statTotalBadge").textContent = useLocalStore() ? "محلي" : "☁ XBloom";
}

function homeRow(r) {
  const tea = recipeKind(r) === "tea";
  const ml = Math.round((Number(r.dose_g) || 0) * (Number(r.ratio) || 0));
  const color = escapeHtml(r.color || (tea ? "#4fae73" : "#f26b1d"));
  return `<div class="hrow" data-recipe-id="${escapeHtml(String(r.id))}" role="button" tabindex="0">
    <span class="hrow-av" style="background:radial-gradient(circle at 35% 30%,${color},rgba(0,0,0,.35))">${tea ? "🍵" : "☕"}</span>
    <span class="hrow-txt"><b>${escapeHtml(r.name || "وصفة")}</b><small>${r.dose_g}g · ${ml}ml${tea ? "" : ` · طحن ${r.grind_size ?? "—"}`}</small></span>
    <span class="hrow-tag ${tea ? "tea" : "coffee"}">${tea ? "شاي" : "قهوة"}</span>
    ${tea ? "" : `<button class="hrow-brew" data-act="brew" type="button" aria-label="شغّل الآن">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10-6.5z"/></svg></button>`}
  </div>`;
}

async function populateHomeGrid() {
  const grid = $("#homeRecipeGrid");
  if (!grid) return;
  homeRecipes = await fetchRecipesForHome().catch(() => []);
  renderHomeStats(homeRecipes);
  grid.innerHTML = homeRecipes.length
    ? homeRecipes.slice(0, 6).map(homeRow).join("")
    : `<p class="muted small home-empty">لا توجد وصفات بعد — اسأل الـ AI فوق ☝️</p>`;
}

function syncHomeProfile(email) {
  const name = settings.name || (email ? email.split("@")[0] : "") || "ضيف";
  $("#homeName").textContent = name;
  $("#homeEmail").textContent = email || "غير مسجّل";
  $("#homeAiName").textContent = settings.name || (email ? name : "بك");
  $("#homeAvatarLetter").textContent = (name[0] || "؟").toUpperCase();
}

$("#homeRecipeGrid").addEventListener("click", (e) => {
  const row = e.target.closest("[data-recipe-id]");
  if (!row) return;
  const r = homeRecipes.find((x) => String(x.id) === row.dataset.recipeId);
  if (!r) return;
  if (e.target.closest("[data-act='brew']")) {
    state.preview = asSpec(r);
    brewOnMachine(state.preview);
    return;
  }
  fillManualForm(asSpec(r), r.id);
  showPanel("manual");
});

$$(".ai-chip").forEach((chip) => chip.addEventListener("click", () => {
  $$(".ai-chip").forEach((c) => c.classList.toggle("active", c === chip));
  $("#homeAiInput").value = chip.dataset.prompt;
  $("#homeAiInput").focus();
}));

$("#homeAiForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#homeAiInput").value.trim() || $(".ai-chip.active")?.dataset.prompt || "";
  if (!text) return;
  showPanel("assistant");
  $("#aiDescInput").value = text;
  $("#aiBrewBtn").click();
});

{
  const ready = !!window.XBBle?.supported();
  const st = $("#homeLinkState");
  st.textContent = ready ? "Bluetooth جاهز" : "افتح من Chrome";
  st.classList.toggle("ok", ready);
  $("#homeLinkCard").addEventListener("click", () => {
    if (ready) toast("اختر وصفة قهوة واضغط ▶ لتشغيلها على الجهاز");
    else $("#bleSetupModal").classList.remove("hidden");
  });
}

// On mobile, default to home panel; on desktop keep manual
if (window.innerWidth <= 767) {
  showPanel("home");
}

// --- session ---

function setHomeLogin(loggedIn, email) {
  const pill = $("#homeLoginBtn");
  if (!pill) return;
  pill.dataset.loggedIn = loggedIn ? "1" : "";
  pill.classList.toggle("on", !!loggedIn);
  pill.textContent = loggedIn ? "✓ متصل بحساب XBloom" : "دخول حساب XBloom";
  syncHomeProfile(loggedIn ? email : null);
}

async function refreshSession() {
  try {
    const s = await api("/api/session");
    if (s.loggedIn) {
      $("#sessionLabel").textContent = s.email || "مسجل";
      $("#sessionHint").textContent = "متصل بالسحابة";
      const initial = (s.email || "؟")[0].toUpperCase();
      $("#avatarInitial").textContent = initial;
      if ($("#homeAvatarLetter")) $("#homeAvatarLetter").textContent = initial;
      setHomeLogin(true, s.email);
      $("#loginBtn").classList.add("hidden");
      $("#logoutBtn").classList.remove("hidden");
    } else {
      $("#sessionLabel").textContent = "غير مسجل";
      $("#sessionHint").textContent = "الوضع المحلي";
      $("#avatarInitial").textContent = "?";
      if ($("#homeAvatarLetter")) $("#homeAvatarLetter").textContent = "؟";
      setHomeLogin(false);
      $("#loginBtn").classList.remove("hidden");
      $("#logoutBtn").classList.add("hidden");
    }
  } catch {
    $("#sessionLabel").textContent = "تعذّر الاتصال";
    $("#sessionHint").textContent = "السيرفر غير متاح";
  }
}

$("#loginBtn").addEventListener("click", () => $("#loginModal").classList.remove("hidden"));
$("#loginCancel").addEventListener("click", () => $("#loginModal").classList.add("hidden"));
$("#loginModal").addEventListener("click", (e) => {
  if (e.target.id === "loginModal") $("#loginModal").classList.add("hidden");
});

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector(".btn-accent");
  btn.disabled = true;
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    $("#loginModal").classList.add("hidden");
    e.target.reset();
    toast("تم تسجيل الدخول");
    await refreshSession();
    if ($("#panel-home")?.classList.contains("active")) populateHomeGrid();
  } catch (err) {
    toast(err.message, "bad");
  } finally {
    btn.disabled = false;
  }
});

async function logout() {
  await api("/api/logout", { method: "POST" });
  toast("تم تسجيل الخروج");
  await refreshSession();
  $("#recipeList").innerHTML = '<div class="empty"><p class="muted">سجّل الدخول لعرض وصفاتك.</p></div>';
  populateHomeGrid();
}
$("#logoutBtn").addEventListener("click", logout);

$("#homeLoginBtn").addEventListener("click", () => {
  if ($("#homeLoginBtn").dataset.loggedIn === "1") {
    if (confirm("تسجيل الخروج من حساب XBloom؟")) logout();
  } else {
    $("#loginModal").classList.remove("hidden");
  }
});

// --- provider switching (Ollama ↔ OpenRouter) ---

$$("[data-provider]").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.provider = btn.dataset.provider;
    $$("[data-provider]").forEach((b) => b.classList.toggle("active", b.dataset.provider === state.provider));
    localStorage.setItem("xbloom.provider", state.provider);
    const isOR = state.provider === "openrouter";
    $("#assistHint").textContent = isOR
      ? "OpenRouter — سحابة، يدعم صور وموديلات متعددة"
      : "Ollama — محلي، بدون إنترنت";
    loadModels();
  });
});

// --- models ---

const OR_DEFAULT_MODELS = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", vision: true },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", vision: true },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", vision: true },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", vision: true },
  { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5", provider: "Google", vision: true },
  { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5", provider: "Google", vision: true },
  { id: "mistralai/mistral-small-3.2-24b-instruct:free", name: "Mistral Small (مجاني)", provider: "Mistral", vision: false },
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (مجاني)", provider: "Meta", vision: false },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", provider: "Alibaba", vision: false },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (مجاني)", provider: "DeepSeek", vision: false },
];

function populateModelSelect(models, savedKey) {
  const sel = $("#modelSelect");
  const saved = localStorage.getItem(savedKey);
  const groups = {};
  models.forEach((m) => { (groups[m.provider || "أخرى"] ??= []).push(m); });
  sel.innerHTML = Object.entries(groups)
    .map(([g, ms]) =>
      `<optgroup label="${g}">${ms.map((m) => `<option value="${m.id}">${m.name}${m.vision ? " 👁" : ""}</option>`).join("")}</optgroup>`
    ).join("");
  if (saved) sel.value = saved;
  sel.onchange = () => localStorage.setItem(savedKey, sel.value);
}

async function loadModels() {
  const sel = $("#modelSelect");
  sel.innerHTML = "<option>…</option>";
  sel.disabled = true;
  $("#orKeyBanner").classList.add("hidden");

  const isOR = state.provider === "openrouter";
  const savedKey = `xbloom.model.${state.provider}`;

  try {
    if (isOR) {
      const key = IS_STATIC ? settings.orKey : null; // static = use settings key; local = server checks .env
      if (IS_STATIC) {
        // direct browser → OpenRouter
        if (!settings.orKey) {
          $("#orKeyBanner").classList.remove("hidden");
          sel.innerHTML = '<option value="">أضف مفتاح OpenRouter في الإعدادات</option>';
          return;
        }
        try {
          const resp = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${settings.orKey}` },
          });
          const data = await resp.json();
          const models = (data.data || []).filter((m) => m.id && m.name).slice(0, 120).map((m) => ({
            id: m.id,
            name: m.name,
            provider: (m.id.split("/")[0] || "").replace(/-/g, " "),
            vision: !!(m.architecture?.modality?.includes("image")),
          }));
          populateModelSelect(models.length ? models : OR_DEFAULT_MODELS, savedKey);
        } catch {
          populateModelSelect(OR_DEFAULT_MODELS, savedKey);
        }
      } else {
        // via local server
        const { models, hasKey } = await api("/api/openrouter/models");
        if (!hasKey) {
          $("#orKeyBanner").classList.remove("hidden");
          sel.innerHTML = '<option value="">أضف مفتاح في الإعدادات أو .env</option>';
          return;
        }
        if (!models.length) { sel.innerHTML = '<option value="">لا توجد موديلات</option>'; return; }
        populateModelSelect(models, savedKey);
      }
    } else {
      if (IS_STATIC) {
        // direct browser → Ollama (may fail if CORS not enabled)
        try {
          const resp = await fetch(`${settings.ollamaUrl}/api/tags`);
          const data = await resp.json();
          const models = (data.models || []).map((m) => m.name);
          if (!models.length) { sel.innerHTML = '<option value="">لا توجد موديلات في Ollama</option>'; return; }
          const saved = localStorage.getItem(savedKey);
          sel.innerHTML = models.map((m) => `<option value="${m}">${m}</option>`).join("");
          if (saved && models.includes(saved)) sel.value = saved;
          sel.onchange = () => localStorage.setItem(savedKey, sel.value);
        } catch {
          sel.innerHTML = '<option value="">Ollama غير متاح — تحقق من الرابط في الإعدادات وفعّل CORS</option>';
        }
      } else {
        const { models } = await api("/api/ollama/models");
        if (!models.length) { sel.innerHTML = '<option value="">لا توجد موديلات</option>'; return; }
        const saved = localStorage.getItem(savedKey);
        sel.innerHTML = models.map((m) => `<option value="${m}">${m}</option>`).join("");
        if (saved && models.includes(saved)) sel.value = saved;
        sel.onchange = () => localStorage.setItem(savedKey, sel.value);
      }
    }
  } catch (e) {
    sel.innerHTML = `<option value="">${isOR ? "OpenRouter" : "Ollama"} غير متاح</option>`;
  } finally {
    sel.disabled = false;
  }
}
$("#refreshModels").addEventListener("click", loadModels);

// ============================================================
// AI FLOW — 3-state: input → brewing → result
// ============================================================

let aiImage = null; // base64 image attached to the current brew request

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function downscaleImage(dataUrl, max = 1280) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale >= 1) return resolve(dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Wire up image upload button in the hero card
$("#aiImgFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("اختر صورة", "bad");
  try {
    const raw = await fileToDataURL(file);
    aiImage = await downscaleImage(raw);
    $("#aiImgThumb").src = aiImage;
    $("#aiImgPreview").classList.remove("hidden");
  } catch { toast("تعذّر قراءة الصورة", "bad"); }
});
$("#aiImgRemove")?.addEventListener("click", () => {
  aiImage = null;
  $("#aiImgPreview").classList.add("hidden");
  $("#aiImgThumb").src = "";
});

// ── state switching ──
function showAiState(name) {
  ["aiStateInput", "aiStateBrewing", "aiStateResult"].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.classList.toggle("hidden", id !== name);
  });
}

// ── brewing stage labels ──
const BREW_STAGES = [
  "جاري تحليل المحصول…",
  "أحسب النسبة المثالية…",
  "أضبط درجة الطحن…",
  "أختار درجة الحرارة…",
  "أرسم تدفق الصبّ…",
  "أنهي تصميم الوصفة…",
];

function startBrewAnimation() {
  let idx = 0;
  const label = $("#brewLabel");
  const steps = $$("[data-s]");
  function advance() {
    if (label) { label.style.opacity = 0; setTimeout(() => { label.textContent = BREW_STAGES[idx % BREW_STAGES.length]; label.style.opacity = 1; }, 200); }
    steps.forEach((s) => s.classList.toggle("active", +s.dataset.s === idx % steps.length));
    idx++;
  }
  advance();
  return setInterval(advance, 1600);
}

// ── try again ──
$("#aiTryAgain")?.addEventListener("click", () => {
  showAiState("aiStateInput");
  state.preview = null;
  $("#previewBody").innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M17 8h1a3 3 0 1 1 0 6h-1M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg><p class="muted">لا توجد وصفة بعد.</p></div>';
  $("#previewBadge").classList.add("hidden");
  $("#previewActions").classList.add("hidden");
});

// ── main brew handler ──
$("#aiBrewBtn").addEventListener("click", async () => {
  const text = $("#aiDescInput").value.trim();
  const image = aiImage;
  if (!text && !image) return toast("اكتب وصف المحصول أو ارفع صورة", "bad");

  showAiState("aiStateBrewing");
  const animTimer = startBrewAnimation();

  state.history = [];
  state.history.push({ role: "user", content: text || "(attached coffee bag image)" });

  let fullText = "", gotRecipe = null, gotError = null;
  try {
    if (IS_STATIC) {
      const liveEl = { querySelector: () => null }; // dummy — not needed for new UI
      await runAssistStatic(
        text, image, liveEl, document.createElement("span"),
        (t) => { fullText += t; },
        (r) => { gotRecipe = r; },
        (e) => { gotError = e; }
      );
    } else {
      const resp = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          model: $("#modelSelect").value || undefined,
          provider: state.provider,
          history: [],
          image: image || undefined,
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "token") fullText += ev.data;
          else if (ev.type === "recipe") gotRecipe = normalizeRecipe(ev.recipe);
          else if (ev.type === "error") gotError = ev.error;
        }
      }
    }
  } catch (err) {
    gotError = String(err.message || err);
  } finally {
    clearInterval(animTimer);
  }

  // Show result state
  showAiState("aiStateResult");
  const errBox = $("#resultErrBox");

  if (gotError) {
    if (errBox) { errBox.textContent = `تعذّر التوليد: ${gotError}`; errBox.classList.remove("hidden"); }
    if ($("#resultName")) $("#resultName").textContent = "حدث خطأ";
    if ($("#resultNotes")) $("#resultNotes").textContent = "";
    return;
  }
  if (errBox) errBox.classList.add("hidden");

  if (gotRecipe) {
    state.preview = gotRecipe;
    state.history.push({ role: "assistant", content: fullText });
    if ($("#resultName")) $("#resultName").textContent = gotRecipe.name || "وصفة جديدة";
    if ($("#resultNotes")) $("#resultNotes").textContent = gotRecipe.notes || "";
    renderPreview(gotRecipe);
    $("#previewBadge").classList.remove("hidden");
    $("#previewActions").classList.add("hidden"); // actions are in result-acts now
  } else {
    if ($("#resultName")) $("#resultName").textContent = "لم تُعَد وصفة JSON";
    if ($("#resultNotes")) $("#resultNotes").textContent = fullText.slice(0, 600);
  }
});

// ── legacy compat stubs (other code references these) ──
function addMsg() {}
function addTypingMsg() { return document.createElement("div"); }
function setMsgText() {}
let attachedImage = null;
function clearAttachment() { aiImage = null; }

// legacy form submit (hidden but referenced) — no-op
$("#chatForm").addEventListener("submit", (e) => e.preventDefault());

$("#chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#chatText").value.trim();
  const image = attachedImage;
  if (!text && !image) return;
  addMsg("user", text || "(صورة مرفقة 📷)");
  state.history.push({ role: "user", content: text || "(attached a photo of the coffee bag)" });
  $("#chatText").value = "";
  clearAttachment();
  $("#sendBtn").disabled = true;

  const live = addTypingMsg();
  const timerEl = document.createElement("span");
  timerEl.className = "timer";
  const started = Date.now();
  const tick = setInterval(() => { timerEl.textContent = ` ${Math.round((Date.now() - started) / 1000)}ث`; }, 1000);

  let liveText = "", gotRecipe = null, gotError = null;
  try {
    if (IS_STATIC) {
      await runAssistStatic(text, image, live, timerEl, (t) => { liveText += t; setMsgText(live, liveText || "…"); live.querySelector("p:last-child")?.appendChild(timerEl); },
        (r) => { gotRecipe = r; }, (e) => { gotError = e; });
    } else {
      const resp = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          model: $("#modelSelect").value || undefined,
          provider: state.provider,
          history: state.history.slice(0, -1).slice(-4),
          image: image || undefined,
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "token") {
            liveText += ev.data;
            setMsgText(live, liveText || "…");
            live.querySelector("p:last-child")?.appendChild(timerEl);
          } else if (ev.type === "recipe") gotRecipe = ev.recipe;
          else if (ev.type === "error") gotError = ev.error;
        }
      }
    }
  } catch (err) {
    gotError = gotError || String(err.message || err);
  } finally {
    clearInterval(tick);
    $("#sendBtn").disabled = false;
  }

  if (gotError) { live.classList.add("err"); setMsgText(live, `تعذّر التوليد: ${gotError}`); return; }
  if (gotRecipe) {
    state.preview = gotRecipe;
    state.history.push({ role: "assistant", content: gotRecipe.notes || "" });
    setMsgText(live, gotRecipe.notes || "تفضل، هذه الوصفة.");
    renderPreview(gotRecipe);
    toast("تم توليد الوصفة");
  } else {
    setMsgText(live, liveText || "لم يرجع الموديل وصفة.");
  }
});

// --- recipe preview ---

function recipeStats(r) {
  const water = (Number(r.dose_g) || 0) * (Number(r.ratio) || 0);
  const isTea = r.kind === "tea";
  const stats = [["الجرعة", `${r.dose_g} g`], ["الماء", `${Math.round(water)} ml`]];
  if (!isTea) { stats.push(["الطحن", r.grind_size ?? "—"]); stats.push(["RPM", r.grind_rpm ?? "—"]); }
  stats.push(["الخطوات", (r.pours || r.steeps || []).length]);
  return stats;
}

function renderPreview(r) {
  $("#previewBadge").classList.remove("hidden");
  const isTea = r.kind === "tea";
  const steps = isTea ? r.steeps || [] : r.pours || [];
  const color = r.color || (isTea ? "#A8C686" : "#B9C4D8");
  const totalWater = (Number(r.dose_g) || 0) * (Number(r.ratio) || 0);
  const sum = steps.reduce((a, s) => a + (Number(s.volume_ml) || 0), 0);
  const drift = totalWater ? Math.round((Math.abs(sum - totalWater) / totalWater) * 100) : 0;
  $("#previewBody").innerHTML = `
    <div class="recipe-title">
      <span class="swatch" style="background:${escapeHtml(color)}"></span>
      <h2>${escapeHtml(r.name || "بدون اسم")}</h2>
      <span class="muted small">${isTea ? "شاي" : "قهوة"}</span>
    </div>
    ${r.notes ? `<p class="muted small">${escapeHtml(r.notes)}</p>` : ""}
    <div class="stat-grid">
      ${recipeStats(r).map(([k, v]) => `<div class="stat"><b>${escapeHtml(v)}</b><span>${escapeHtml(k)}</span></div>`).join("")}
    </div>
    <div class="muted small" style="margin-bottom:.6rem">
      مجموع الماء المُدخل: ${sum} ml ${drift > 3 ? `<span class="bad">(فرق ${drift}%)</span>` : '<span class="ok">✓ مطابق</span>'}
    </div>
    <div class="steps">
      ${steps.map((s, i) => `
        <div class="step">
          <div class="step-head"><b>${isTea ? `النقع ${i + 1}` : escapeHtml(s.name || (i === 0 ? "Bloom" : `Pour ${i + 1}`))}</b></div>
          <div class="step-ctrls">
            <div class="mini-stepper"><span>ماء</span><b>${s.volume_ml ?? "—"}</b></div>
            <div class="mini-stepper"><span>حرارة</span><b>${s.temperature_c ?? "—"}°</b></div>
            ${isTea
              ? `<div class="mini-stepper"><span>نقع</span><b>${s.steep_seconds ?? "—"}ث</b></div>`
              : `<div class="mini-stepper"><span>نمط</span><b>${escapeHtml(PATTERN_LABELS[s.pattern] || s.pattern || "circular")}</b></div>
                 <div class="mini-stepper"><span>توقف</span><b>${s.pause_seconds ?? 0}ث</b></div>`}
          </div>
        </div>`).join("")}
    </div>`;
  $("#previewActions").classList.remove("hidden");
}

$("#sendToManual").addEventListener("click", () => {
  if (!state.preview) return;
  fillManualForm(state.preview);
  showPanel("manual");
});

$("#saveAssisted").addEventListener("click", async () => {
  if (!state.preview) return;
  const ok = await saveRecipe(state.preview);
  if (ok) showPanel("recipes");
});

$("#brewNowBtn").addEventListener("click", () => brewOnMachine(state.preview));
$("#sendToDevice").addEventListener("click", sendToDevice);
$("#sendModalClose").addEventListener("click", () => $("#sendModal").classList.add("hidden"));
$("#sendModal").addEventListener("click", (e) => {
  if (e.target.id === "sendModal") $("#sendModal").classList.add("hidden");
});

// ── Brew on machine ─────────────────────────────────────────────────────────
// Phones/Chrome: Web Bluetooth straight to the machine (xbloom-ble.js).
// Local server without Web Bluetooth: falls back to the xbloom-ble CLI (/api/brew).

let _brewAbort = null;   // AbortController (server path) or { cancel } (BLE path)
let _pendingBrew = null; // recipe waiting for the user to confirm the checklist

const brewUi = () => ({
  modal: $("#brewModal"), log: $("#brewLog"), title: $("#brewModalTitle"),
  subtitle: $("#brewModalSubtitle"), check: $("#brewChecklist"), go: $("#brewModalGo"),
  closeBtn: $("#brewModalClose"), cancelBtn: $("#brewModalCancel"), icon: $("#brewModalIcon"),
});

function brewLog(line) {
  const log = $("#brewLog");
  log.classList.remove("hidden");
  log.textContent += line + "\n";
  log.scrollTop = log.scrollHeight;
}

function brewFinished(titleText, subtitleText) {
  const u = brewUi();
  u.title.textContent = titleText;
  u.subtitle.textContent = subtitleText || "";
  u.icon.style.animation = "";
  u.cancelBtn.classList.add("hidden");
  u.go.classList.add("hidden");
  u.closeBtn.classList.remove("hidden");
  _brewAbort = null;
}

function brewOnMachine(spec) {
  if (!spec) { toast("لا توجد وصفة", "bad"); return; }
  if (spec.kind === "tea") { toast("التحضير المباشر متاح للقهوة فقط حالياً", "bad"); return; }

  if (!window.XBBle?.supported()) {
    if (!IS_STATIC) { brewViaServer(spec); return; }
    $("#bleSetupModal").classList.remove("hidden");
    return;
  }

  _pendingBrew = spec;
  const u = brewUi();
  u.log.textContent = "";
  u.log.classList.add("hidden");
  u.check.classList.remove("hidden");
  u.title.textContent = "جاهز للتحضير؟";
  u.subtitle.textContent = spec.name || "";
  u.icon.style.animation = "";
  u.go.classList.remove("hidden");
  u.go.disabled = false;
  u.cancelBtn.classList.remove("hidden");
  u.closeBtn.classList.add("hidden");
  u.modal.classList.remove("hidden");
}

// Runs inside the "اتصل وابدأ" click so Web Bluetooth gets its user gesture.
$("#brewModalGo").addEventListener("click", () => {
  const spec = _pendingBrew;
  if (!spec) return;
  const u = brewUi();
  u.check.classList.add("hidden");
  u.go.disabled = true;
  u.go.classList.add("hidden");
  u.title.textContent = "جاري التحضير…";
  u.subtitle.textContent = "اختر جهاز XBLOOM من القائمة";
  u.icon.style.animation = "brew-pulse 1.4s ease-in-out infinite";

  let job;
  try {
    job = window.XBBle.brew(spec, {
      onStatus: (text) => { u.subtitle.textContent = text; brewLog(`• ${text}`); },
    });
  } catch (err) {
    brewFinished("تعذّر الاتصال", err.message);
    return;
  }
  _brewAbort = job;
  job.done.then(() => {
    if (_brewAbort === job) brewFinished("القهوة جاهزة ☕", "بالعافية!");
  }).catch((err) => {
    if (_brewAbort !== job) return;
    const msg = err?.name === "NotFoundError" ? "ما تم اختيار جهاز" : (err?.message || String(err));
    brewLog(`✗ ${msg}`);
    brewFinished("ما اكتمل التحضير", msg);
  });
});

async function brewViaServer(spec) {
  let installed = false;
  try { installed = (await api("/api/ble/status")).installed; } catch {}
  if (!installed) { $("#bleSetupModal").classList.remove("hidden"); return; }

  const u = brewUi();
  u.log.textContent = "";
  u.check.classList.add("hidden");
  u.go.classList.add("hidden");
  u.title.textContent = "جاري التحضير…";
  u.subtitle.textContent = "تواصل مع الجهاز عبر Bluetooth";
  u.closeBtn.classList.add("hidden");
  u.cancelBtn.classList.remove("hidden");
  u.icon.style.animation = "brew-pulse 1.4s ease-in-out infinite";
  u.modal.classList.remove("hidden");

  const controller = new AbortController();
  _brewAbort = controller;
  try {
    const resp = await fetch("/api/brew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        let msg;
        try { msg = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (msg.type === "log") brewLog(msg.line);
        else if (msg.type === "done") brewFinished("تم التحضير! ☕", "الوصفة جارٍ تنفيذها الآن");
        else if (msg.type === "error") throw new Error(msg.message);
      }
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    brewLog(`✗ ${err.message}`);
    brewFinished("خطأ في التحضير", err.message || "تأكد من تشغيل الجهاز وإغلاق تطبيق الهاتف");
  }
}

$("#brewModalCancel").addEventListener("click", () => {
  const job = _brewAbort;
  _brewAbort = null;
  _pendingBrew = null;
  if (job?.abort) job.abort();
  if (job?.cancel) job.cancel();
  $("#brewModal").classList.add("hidden");
  if (job) toast("تم إلغاء التحضير");
});
$("#brewModalClose").addEventListener("click", () => $("#brewModal").classList.add("hidden"));
$("#brewModal").addEventListener("click", (e) => {
  if (e.target.id === "brewModal" && !_brewAbort) $("#brewModal").classList.add("hidden");
});
$("#bleSetupClose").addEventListener("click", () => $("#bleSetupModal").classList.add("hidden"));

// ─────────────────────────────────────────────────────────────────────────────

async function sendToDevice() {
  if (!state.preview) return;
  const btn = $("#sendToDevice");
  btn.disabled = true;
  try {
    const result = await api("/api/recipes", { method: "POST", body: JSON.stringify(state.preview) });
    const link = result.share_link || null;
    const linkEl = $("#sendShareLink");
    if (link) {
      linkEl.href = link;
      linkEl.classList.remove("hidden");
    } else {
      linkEl.classList.add("hidden");
    }
    $("#sendModal").classList.remove("hidden");
  } catch (err) {
    if (err.status === 401 || (err.message || "").toLowerCase().includes("not logged in")) {
      toast("يجب تسجيل الدخول أولاً — استخدم زر «دخول XBloom»", "bad");
      $("#loginModal")?.classList.remove("hidden");
    } else {
      toast(err.message || "تعذّر الإرسال للجهاز", "bad");
    }
  } finally {
    btn.disabled = false;
  }
}

async function saveRecipe(spec) {
  if (useLocalStore()) {
    const saved = JSON.parse(localStorage.getItem("xbloom.recipes") || "[]");
    const entry = { ...spec, id: `local-${Date.now()}`, cup_type: spec.kind };
    saved.unshift(entry);
    localStorage.setItem("xbloom.recipes", JSON.stringify(saved));
    toast(`تم حفظ الوصفة محلياً`);
    return true;
  }
  try {
    const out = await api("/api/recipes", { method: "POST", body: JSON.stringify(spec) });
    toast(`تم حفظ الوصفة ✓`);
    return true;
  } catch (err) {
    if (err.status === 401 || (err.message || "").toLowerCase().includes("not logged in")) {
      toast("يجب تسجيل الدخول أولاً — استخدم زر «دخول XBloom»", "bad");
      $("#loginModal")?.classList.remove("hidden");
    } else {
      toast(err.message || "تعذّر الحفظ", "bad");
    }
    return false;
  }
}

// ============================================================
// MANUAL — touch-first, state-driven (no keyboard required)
// ============================================================

const manual = {
  editingId: null,   // cloud recipe id when editing an existing recipe
  kind: "coffee",
  name: "",
  color: "#B9C4D8",
  dose_g: 15,
  ratio: 16,
  grind_size: 70,
  grind_rpm: 80,
  steps: [],
};

const LIMITS = {
  coffee: { dose: [1, 31], ratio: [8, 20], grind: [40, 120], rpm: [60, 120], vol: [1, 400], temp: [40, 95], pause: [0, 255] },
  tea:    { dose: [1, 10], ratio: [1, 99], vol: [1, 90], temp: [65, 100], pause: [0, 360] },
};

function autoName() {
  const n = manual.steps.length;
  if (manual.kind === "tea") return `شاي ${manual.dose_g}g · ${n} نقعة`;
  return `قهوة ${manual.dose_g}g · 1:${manual.ratio} · ${n} صبات`;
}

function defaultSteps(kind) {
  if (kind === "tea") return [{ volume_ml: 80, temperature_c: 85, steep_seconds: 120 }];
  return [
    { volume_ml: 45, temperature_c: 93, pattern: "circular", pause_seconds: 45, agitate_before: false, agitate_after: false },
    { volume_ml: 105, temperature_c: 93, pattern: "circular", pause_seconds: 0, agitate_before: false, agitate_after: false },
    { volume_ml: 90, temperature_c: 93, pattern: "circular", pause_seconds: 0, agitate_before: false, agitate_after: false },
  ];
}

function setKindFlags() {
  const tea = manual.kind === "tea";
  $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.kind === manual.kind));
  $$("[data-coffee-only]").forEach((el) => el.classList.toggle("hidden", tea));
  $$("[data-tea-only]").forEach((el) => el.classList.toggle("hidden", !tea));
  $("#stepsTitle").innerHTML = (tea ? "النقعات" : "الصبات") + ` <span class="steps-count" id="stepsCount">${manual.steps.length}</span>`;
}

function renderSteps() {
  const tea = manual.kind === "tea";
  $("#steps").innerHTML = manual.steps.map((s, i) => {
    const head = tea ? `النقع ${i + 1}` : (i === 0 ? "Bloom" : `Pour ${i + 1}`);
    if (tea) {
      return `
      <div class="step">
        <div class="step-head"><b>${head}</b><button class="remove" data-act="remove" data-i="${i}" title="حذف" type="button">✕</button></div>
        <div class="step-ctrls">
          <div class="mini-stepper"><span>ماء</span>
            <button data-act="adj" data-i="${i}" data-k="vol" data-d="-5" type="button">−</button>
            <b>${s.volume_ml}</b>
            <button data-act="adj" data-i="${i}" data-k="vol" data-d="5" type="button">+</button>
          </div>
          <div class="mini-stepper"><span>حرارة</span>
            <button data-act="adj" data-i="${i}" data-k="temp" data-d="-1" type="button">−</button>
            <b>${s.temperature_c}°</b>
            <button data-act="adj" data-i="${i}" data-k="temp" data-d="1" type="button">+</button>
          </div>
          <div class="mini-stepper"><span>المدة</span>
            <button data-act="adj" data-i="${i}" data-k="pause" data-d="-15" type="button">−</button>
            <b>${s.steep_seconds}ث</b>
            <button data-act="adj" data-i="${i}" data-k="pause" data-d="15" type="button">+</button>
          </div>
        </div>
        <div class="chips">
          ${[30, 60, 90, 120, 180].map((v) => `<button class="chip ${s.steep_seconds === v ? "active" : ""}" data-act="set" data-i="${i}" data-k="steep" data-v="${v}" type="button">${v}ث</button>`).join("")}
        </div>
      </div>`;
    }
    return `
    <div class="step">
      <div class="step-head"><b>${head}</b><button class="remove" data-act="remove" data-i="${i}" title="حذف" type="button">✕</button></div>
      <div class="step-ctrls">
        <div class="mini-stepper"><span>ماء</span>
          <button data-act="adj" data-i="${i}" data-k="vol" data-d="-5" type="button">−</button>
          <b>${s.volume_ml}</b>
          <button data-act="adj" data-i="${i}" data-k="vol" data-d="5" type="button">+</button>
        </div>
        <div class="mini-stepper"><span>حرارة</span>
          <button data-act="adj" data-i="${i}" data-k="temp" data-d="-1" type="button">−</button>
          <b>${s.temperature_c}°</b>
          <button data-act="adj" data-i="${i}" data-k="temp" data-d="1" type="button">+</button>
        </div>
        <div class="mini-stepper"><span>توقف</span>
          <button data-act="adj" data-i="${i}" data-k="pause" data-d="-5" type="button">−</button>
          <b>${s.pause_seconds}ث</b>
          <button data-act="adj" data-i="${i}" data-k="pause" data-d="5" type="button">+</button>
        </div>
      </div>
      <div class="chips">
        ${["circular", "centered", "spiral"].map((p) =>
          `<button class="chip ${s.pattern === p ? "active" : ""}" data-act="set" data-i="${i}" data-k="pattern" data-v="${p}" type="button">${PATTERN_LABELS[p]}</button>`).join("")}
        ${[0, 15, 30, 45, 60].map((v) =>
          `<button class="chip ${s.pause_seconds === v ? "active" : ""}" data-act="set" data-i="${i}" data-k="pause" data-v="${v}" type="button">${v}ث</button>`).join("")}
      </div>
      <div class="row" style="margin-top:.55rem;gap:1.1rem">
        <label class="check"><input type="checkbox" data-act="agit" data-i="${i}" data-k="before" ${s.agitate_before ? "checked" : ""}/> تحريك قبل</label>
        <label class="check"><input type="checkbox" data-act="agit" data-i="${i}" data-k="after" ${s.agitate_after ? "checked" : ""}/> تحريك بعد</label>
      </div>
    </div>`;
  }).join("");
}

function syncManual() {
  const tea = manual.kind === "tea";
  const sum = manual.steps.reduce((a, s) => a + (Number(s.volume_ml) || 0), 0);

  $("#heroName").textContent = manual.name.trim() || autoName();
  $("#heroNum").textContent = manual.steps.length;
  $("#heroKind").textContent = tea ? "STEEP" : "POUR";
  $("#doseBig").textContent = manual.dose_g;
  $("#waterBig").textContent = Math.round(manual.dose_g * manual.ratio);
  $("#stepsCount").textContent = manual.steps.length;
  const gb = $("#grindBig"); if (gb) gb.textContent = tea ? "—" : manual.grind_size;
  const rb = $("#rpmBig"); if (rb) rb.textContent = tea ? "—" : manual.grind_rpm;
  const ratioEl = $("#ratioBig");
  if (ratioEl) ratioEl.textContent = tea ? (manual.dose_g ? (sum / manual.dose_g).toFixed(1) : "—") : manual.ratio;
  $("#heroCard").style.background = heroBackground(manual.color);

  document.querySelectorAll("#manualForm [data-gset]").forEach((c) => {
    const [k, v] = c.dataset.gset.split(":");
    const cur = k === "dose" ? manual.dose_g : k === "ratio" ? manual.ratio : k === "grind" ? manual.grind_size : manual.grind_rpm;
    c.classList.toggle("active", Number(cur) === Number(v));
  });
  const gr = $("#grindRange"); if (gr && Number(gr.value) !== Number(manual.grind_size)) gr.value = manual.grind_size;
  const ci = $("#colorInput"); if (ci && ci.value.toLowerCase() !== manual.color.toLowerCase()) ci.value = manual.color;
  document.querySelectorAll(".swatch-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.color.toLowerCase() === manual.color.toLowerCase())
  );
  const ni = $("#nameInput"); if (ni) ni.placeholder = autoName();

  const target = manual.dose_g * manual.ratio;
  $("#totalWater").textContent = Math.round(tea ? sum : target);
  $("#pourSum").textContent = `${Math.round(sum)} / ${Math.round(target)}ml`;
  const badge = $("#volumeCheck");
  if (tea) { badge.textContent = sum ? "✓" : ""; badge.className = "ok"; }
  else if (target > 0) {
    const drift = Math.abs(sum - target) / target;
    if (drift <= 0.03) { badge.textContent = "المجموع مطابق ✓"; badge.className = "ok"; }
    else { badge.textContent = `فرق ${Math.round(drift * 100)}%`; badge.className = "bad"; }
  } else badge.textContent = "";

  setKindFlags();
  renderSteps();
}

function applyGStep(k, d) {
  const L = LIMITS[manual.kind];
  if (k === "dose") manual.dose_g = clampN(+(manual.dose_g + d).toFixed(1), ...L.dose);
  else if (k === "ratio") manual.ratio = clampN(+(manual.ratio + d).toFixed(1), ...L.ratio);
  else if (k === "grind") manual.grind_size = clampN(manual.grind_size + d, ...L.grind);
  else if (k === "rpm") manual.grind_rpm = clampN(manual.grind_rpm + d, ...L.rpm);
  syncManual();
}

$("#manualForm").addEventListener("click", (e) => {
  const el = e.target.closest("[data-gstep],[data-gset],[data-temp],[data-color]");
  if (!el) return;
  if (el.dataset.gstep) { const [k, d] = el.dataset.gstep.split(":"); applyGStep(k, +d); return; }
  if (el.dataset.gset) {
    const [k, v] = el.dataset.gset.split(":");
    if (k === "dose") manual.dose_g = clampN(+v, ...LIMITS[manual.kind].dose);
    else if (k === "ratio") manual.ratio = clampN(+v, ...LIMITS[manual.kind].ratio);
    else if (k === "grind") manual.grind_size = clampN(+v, ...LIMITS[manual.kind].grind);
    else if (k === "rpm") manual.grind_rpm = clampN(+v, ...LIMITS[manual.kind].rpm);
    syncManual(); return;
  }
  if (el.dataset.temp) { manual.steps.forEach((s) => { s.temperature_c = +el.dataset.temp; }); syncManual(); return; }
  if (el.dataset.color) { manual.color = el.dataset.color; syncManual(); return; }
});

$("#steps").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.dataset.act === "agit") return;
  const i = +btn.dataset.i;
  const s = manual.steps[i];
  if (!s) return;
  const L = LIMITS[manual.kind];
  const act = btn.dataset.act;
  if (act === "remove") { manual.steps.splice(i, 1); syncManual(); return; }
  if (act === "adj") {
    const d = +btn.dataset.d;
    if (btn.dataset.k === "vol") s.volume_ml = clampN(s.volume_ml + d, ...L.vol);
    else if (btn.dataset.k === "temp") s.temperature_c = clampN(s.temperature_c + d, ...L.temp);
    else if (btn.dataset.k === "pause") {
      const key = manual.kind === "tea" ? "steep_seconds" : "pause_seconds";
      s[key] = clampN((s[key] || 0) + d, ...L.pause);
    }
    syncManual(); return;
  }
  if (act === "set") {
    if (btn.dataset.k === "pattern") s.pattern = btn.dataset.v;
    else if (btn.dataset.k === "pause") s.pause_seconds = +btn.dataset.v;
    else if (btn.dataset.k === "steep") s.steep_seconds = +btn.dataset.v;
    syncManual(); return;
  }
});

$("#steps").addEventListener("change", (e) => {
  const cb = e.target.closest('[data-act="agit"]');
  if (!cb) return;
  const s = manual.steps[+cb.dataset.i];
  if (s) s["agitate_" + cb.dataset.k] = cb.checked;
});

$("#grindRange").addEventListener("input", (e) => {
  manual.grind_size = clampN(+e.target.value, ...LIMITS.coffee.grind);
  $("#grindBig").textContent = manual.grind_size;
  document.querySelectorAll("#manualForm [data-gset]").forEach((c) => {
    const [k, v] = c.dataset.gset.split(":");
    c.classList.toggle("active", k === "grind" && Number(manual.grind_size) === Number(v));
  });
});

$("#colorInput").addEventListener("input", (e) => {
  manual.color = e.target.value;
  $("#heroCard").style.background = heroBackground(manual.color);
  document.querySelectorAll(".swatch-btn").forEach((b) => b.classList.remove("active"));
});

$("#nameInput").addEventListener("input", (e) => {
  manual.name = e.target.value;
  $("#heroName").textContent = manual.name.trim() || autoName();
  e.target.placeholder = autoName();
});

$("#autoNameBtn").addEventListener("click", () => {
  manual.name = "";
  $("#nameInput").value = "";
  syncManual();
});

$("#balanceBtn").addEventListener("click", () => {
  if (manual.kind !== "coffee") return;
  const total = manual.dose_g * manual.ratio;
  const n = manual.steps.length;
  if (!n) { toast("أضف خطوة أولاً", "bad"); return; }
  if (n === 1) { manual.steps[0].volume_ml = Math.round(total); syncManual(); toast("تمت الموازنة"); return; }
  const bloom = clampN(Math.round((manual.dose_g * 2.5) / 5) * 5, 15, 80);
  const rest = Math.max(0, total - bloom);
  const each = Math.max(5, Math.round(rest / (n - 1)));
  manual.steps[0].volume_ml = Math.min(bloom, total - (n - 1) * 5);
  for (let i = 1; i < n; i++) manual.steps[i].volume_ml = each;
  const sum = manual.steps.reduce((a, s) => a + s.volume_ml, 0);
  manual.steps[n - 1].volume_ml = Math.max(5, manual.steps[n - 1].volume_ml + (total - sum));
  syncManual();
  toast("تمت موازنة الماء تلقائياً");
});

$("#addStep").addEventListener("click", () => {
  const max = manual.kind === "tea" ? 3 : 7;
  if (manual.steps.length >= max) { toast(`الحد الأقصى ${max} خطوات`, "bad"); return; }
  if (manual.kind === "tea") {
    manual.steps.push({ volume_ml: 80, temperature_c: 85, steep_seconds: 120 });
  } else {
    const sum = manual.steps.reduce((a, s) => a + s.volume_ml, 0);
    const target = manual.dose_g * manual.ratio;
    const suggested = Math.max(10, Math.round((target - sum) / Math.max(1, max - manual.steps.length)));
    manual.steps.push({ volume_ml: clampN(suggested, 10, 400), temperature_c: 93, pattern: "circular", pause_seconds: 0, agitate_before: false, agitate_after: false });
  }
  syncManual();
});

function buildSpec() {
  const tea = manual.kind === "tea";
  const sum = manual.steps.reduce((a, s) => a + (Number(s.volume_ml) || 0), 0);
  const spec = {
    kind: manual.kind,
    name: manual.name.trim() || autoName(),
    dose_g: manual.dose_g,
    ratio: tea ? Number((manual.dose_g ? sum / manual.dose_g : 15).toFixed(1)) : manual.ratio,
    color: manual.color,
  };
  if (tea) {
    spec.steeps = manual.steps.slice(0, 3).map((s) => ({
      volume_ml: clampN(s.volume_ml, ...LIMITS.tea.vol),
      temperature_c: clampN(s.temperature_c, ...LIMITS.tea.temp),
      steep_seconds: Math.round(clampN(s.steep_seconds, ...LIMITS.tea.pause)),
    }));
  } else {
    spec.grind_size = manual.grind_size;
    spec.grind_rpm = manual.grind_rpm;
    spec.pours = manual.steps.map((s, i) => ({
      name: i === 0 ? "Bloom" : `Pour ${i + 1}`,
      volume_ml: clampN(s.volume_ml, ...LIMITS.coffee.vol),
      temperature_c: clampN(s.temperature_c, ...LIMITS.coffee.temp),
      pattern: PATTERN_LABELS[s.pattern] ? s.pattern : "circular",
      flow_rate: 3.2,
      pause_seconds: Math.round(clampN(s.pause_seconds, ...LIMITS.coffee.pause)),
      agitate_before: !!s.agitate_before,
      agitate_after: !!s.agitate_after,
    }));
  }
  return spec;
}

$("#saveManual").addEventListener("click", async () => {
  if (!manual.steps.length) return toast("أضف خطوة واحدة على الأقل", "bad");
  const spec = buildSpec();
  try {
    if (manual.editingId) {
      // update the existing cloud recipe in place
      await api(`/api/recipes/${manual.editingId}`, { method: "PUT", body: JSON.stringify(spec) });
      toast(`تم تحديث الوصفة (${manual.editingId})`);
    } else {
      const out = await api("/api/recipes", { method: "POST", body: JSON.stringify(spec) });
      toast(`تم حفظ الوصفة (${out.id})`);
    }
    manual.editingId = null;
    showPanel("recipes");
  } catch (err) {
    toast(err.message, "bad");
  }
});

$("#manualImportBtn").addEventListener("click", () => showPanel("import"));

$$(".seg-btn").forEach((b) => b.addEventListener("click", () => {
  if (manual.kind === b.dataset.kind) return;
  manual.kind = b.dataset.kind;
  manual.dose_g = clampN(manual.dose_g, ...LIMITS[manual.kind].dose);
  manual.color = manual.kind === "tea" ? "#A8C686" : "#B9C4D8";
  manual.steps = defaultSteps(manual.kind);
  syncManual();
}));

function fillManualForm(r, recipeId = null) {
  manual.editingId = recipeId;
  manual.kind = (r.kind === "tea" || r.cup_type === "tea") ? "tea" : "coffee";
  manual.name = r.name || "";
  manual.dose_g = clampN(r.dose_g ?? 15, ...LIMITS[manual.kind].dose);
  manual.ratio = clampN(r.ratio ?? 16, ...LIMITS[manual.kind].ratio);
  manual.color = r.color || (manual.kind === "tea" ? "#A8C686" : "#B9C4D8");
  if (manual.kind === "coffee") {
    manual.grind_size = clampN(r.grind_size ?? 70, ...LIMITS.coffee.grind);
    manual.grind_rpm = clampN(r.grind_rpm ?? 80, ...LIMITS.coffee.rpm);
    manual.steps = (r.pours || r.pourList || []).slice(0, 7).map((p) => ({
      volume_ml: clampN(p.volume_ml ?? 30, ...LIMITS.coffee.vol),
      temperature_c: clampN(p.temperature_c ?? 93, ...LIMITS.coffee.temp),
      pattern: PATTERN_LABELS[p.pattern] ? p.pattern : "circular",
      pause_seconds: clampN(p.pause_seconds ?? 0, ...LIMITS.coffee.pause),
      agitate_before: !!p.agitate_before,
      agitate_after: !!p.agitate_after,
    }));
  } else {
    manual.steps = (r.steeps || []).slice(0, 3).map((s) => ({
      volume_ml: clampN(s.volume_ml ?? 80, ...LIMITS.tea.vol),
      temperature_c: clampN(s.temperature_c ?? 85, ...LIMITS.tea.temp),
      steep_seconds: clampN(s.steep_seconds ?? 120, ...LIMITS.tea.pause),
    }));
  }
  if (!manual.steps.length) manual.steps = defaultSteps(manual.kind);
  const ni = $("#nameInput");
  if (ni) ni.value = manual.name;
  syncManual();
}

// ============================================================
// RECIPES LIST + IMPORT + BOOT
// ============================================================

const ICON_EDIT = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
const ICON_COPY = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
const ICON_TRASH = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
const ICON_SHARE = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';

async function loadRecipes() {
  const box = $("#recipeList");
  box.innerHTML = '<div class="empty"><p class="muted">…</p></div>';
  try {
    let recipes;
    if (useLocalStore()) {
      recipes = JSON.parse(localStorage.getItem("xbloom.recipes") || "[]");
    } else {
      ({ recipes } = await api("/api/recipes"));
    }
    if (!recipes.length) { box.innerHTML = '<div class="empty"><p class="muted">لا توجد وصفات.</p></div>'; return; }
    box.innerHTML = recipes.map(recipeCard).join("");
  } catch (err) {
    box.innerHTML = `<div class="empty"><p class="muted">${escapeHtml(err.message)}</p></div>`;
  }
}

function recipeCard(r) {
  const isTea = r.cup_type === "tea";
  const total = (Number(r.dose_g) || 0) * (Number(r.ratio) || 0);
  return `
    <div class="recipe" data-id="${r.id}">
      <h3><span class="swatch" style="background:${escapeHtml(r.color || "#B9C4D8")}"></span>${escapeHtml(r.name)}</h3>
      <div class="meta">${isTea ? "شاي" : "قهوة"} · ${r.dose_g}g · ${Math.round(total)}ml${isTea ? "" : ` · طحن ${r.grind_size}`}</div>
      <div class="meta">${(r.pours?.length || 0)} خطوة${r.share_link ? ` · <a href="${escapeHtml(r.share_link)}" target="_blank">مشاركة</a>` : ""}</div>
      <div class="acts">
        <button class="btn" data-act="edit" type="button">${ICON_EDIT} تعديل</button>
        <button class="btn" data-act="dup" type="button">${ICON_COPY} نسخ</button>
        <button class="btn" data-act="pub" type="button">${ICON_SHARE} نشر</button>
        <button class="btn btn-danger" data-act="del" type="button">${ICON_TRASH} حذف</button>
      </div>
    </div>`;
}

$("#recipeList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest(".recipe");
  const id = card.dataset.id;
  const name = card.querySelector("h3").textContent.trim();
  if (btn.dataset.act === "del") {
    if (!confirm(`حذف الوصفة "${name}"؟ لا يمكن التراجع.`)) return;
    try {
      if (useLocalStore()) {
        const saved = JSON.parse(localStorage.getItem("xbloom.recipes") || "[]").filter((x) => String(x.id) !== String(id));
        localStorage.setItem("xbloom.recipes", JSON.stringify(saved));
        toast("تم الحذف");
      } else {
        await api(`/api/recipes/${id}`, { method: "DELETE" });
        toast("تم الحذف");
      }
      loadRecipes();
    } catch (err) { toast(err.message, "bad"); }
    return;
  }
  try {
    const recipes = useLocalStore()
      ? JSON.parse(localStorage.getItem("xbloom.recipes") || "[]")
      : (await api("/api/recipes")).recipes;
    const r = recipes.find((x) => String(x.id) === String(id));
    if (!r) return;
    if (btn.dataset.act === "dup") {
      const copy = { kind: r.cup_type === "tea" ? "tea" : "coffee", name: `${r.name} (نسخة)`, dose_g: r.dose_g, ratio: r.ratio, color: r.color, pours: r.pours };
      const ok = await saveRecipe(copy);
      if (ok) loadRecipes();
      return;
    }
    if (btn.dataset.act === "pub") {
      const spec = {
        kind: r.cup_type === "tea" ? "tea" : "coffee",
        name: r.name, dose_g: r.dose_g, ratio: r.ratio,
        color: r.color, notes: r.notes || "",
        grind_size: r.grind_size, grind_rpm: r.grind_rpm,
        pours: r.pours, steeps: r.pours,
      };
      try {
        if (IS_STATIC) {
          publishCommunityStatic(spec);
          toast(`تم نشر "${r.name}" في المجتمع ✓`);
        } else {
          await api("/api/community/publish", { method: "POST", body: JSON.stringify(spec) });
          toast(`تم نشر "${r.name}" في المجتمع ✓`);
        }
      } catch (e) { toast(e.message, "bad"); }
      return;
    }
    // open the recipe in the manual builder for full editing
    fillManualForm({
      kind: r.cup_type === "tea" ? "tea" : "coffee",
      name: r.name,
      dose_g: r.dose_g,
      ratio: r.ratio,
      color: r.color,
      grind_size: r.grind_size,
      grind_rpm: r.grind_rpm,
      pours: r.pours,
      steeps: r.pours,
    }, id);
    showPanel("manual");
    toast(`تعديل: ${r.name}`);
  } catch (err) { toast(err.message, "bad"); }
});

$("#reloadRecipes").addEventListener("click", loadRecipes);

// --- import ---

$("#importBtn").addEventListener("click", async () => {
  const url = $("#importUrl").value.trim();
  if (!url) return;
  $("#importResult").innerHTML = '<p class="muted">…</p>';
  try {
    const recipe = await api("/api/import", { method: "POST", body: JSON.stringify({ share_url: url }) });
    state.preview = recipe;
    renderPreview(recipe);
    $("#importResult").innerHTML = '<p class="ok">تم الجلب.</p>';
    toast("تم جلب الوصفة");
    showPanel("assistant");
  } catch (err) {
    $("#importResult").innerHTML = `<p class="bad">${escapeHtml(err.message)}</p>`;
  }
});

// ============================================================
// COMMUNITY
// ============================================================

const communityFilters = { kind: "all", roast: "all", process: "all", search: "" };
let communitySearchTimer = null;

function communityCard(r) {
  const isTea = r.kind === "tea";
  const steps = isTea ? (r.steeps || []) : (r.pours || []);
  const tags = [
    r.origin ? `<span class="com-tag">${escapeHtml(r.origin)}${r.region ? ` · ${escapeHtml(r.region)}` : ""}</span>` : "",
    r.process ? `<span class="com-tag">${escapeHtml(PROCESS_LABELS[r.process] || r.process)}</span>` : "",
    r.roast ? `<span class="com-tag">${escapeHtml(ROAST_LABELS[r.roast] || r.roast)}</span>` : "",
    r.company ? `<span class="com-tag com-tag-company">${escapeHtml(r.company)}</span>` : "",
  ].filter(Boolean).join("");
  return `
    <div class="recipe com-recipe" data-cid="${escapeHtml(r.id)}">
      <div class="com-color-bar" style="background:${escapeHtml(r.color || "#B9C4D8")}"></div>
      <div class="com-body">
        <h3><span class="swatch" style="background:${escapeHtml(r.color || "#B9C4D8")}"></span>${escapeHtml(r.name)}</h3>
        <div class="meta">${isTea ? "شاي" : "قهوة"} · ${r.dose_g}g · 1:${r.ratio} · ${steps.length} ${isTea ? "نقعة" : "صبة"}</div>
        <div class="com-tags">${tags}</div>
        ${r.notes ? `<p class="com-notes muted small">${escapeHtml(r.notes.slice(0, 120))}${r.notes.length > 120 ? "…" : ""}</p>` : ""}
        <div class="com-foot">
          <span class="com-author muted small">✍ ${escapeHtml(r.author || "مجهول")}</span>
          <div class="acts">
            <button class="btn" data-cact="like" type="button">
              <svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              ${r.likes || 0}
            </button>
            <button class="btn" data-cact="import" type="button">${ICON_COPY} استيراد</button>
          </div>
        </div>
      </div>
    </div>`;
}

async function loadCommunity() {
  const box = $("#communityList");
  box.innerHTML = '<div class="empty"><p class="muted">…</p></div>';
  try {
    let recipes;
    if (IS_STATIC) {
      recipes = getCommunityStatic();
    } else {
      const q = new URLSearchParams();
      if (communityFilters.kind !== "all") q.set("kind", communityFilters.kind);
      if (communityFilters.roast !== "all") q.set("roast", communityFilters.roast);
      if (communityFilters.process !== "all") q.set("process", communityFilters.process);
      if (communityFilters.search) { q.set("origin", communityFilters.search); q.set("company", communityFilters.search); }
      ({ recipes } = await api(`/api/community?${q}`));
    }
    if (!recipes.length) { box.innerHTML = '<div class="empty"><p class="muted">لا توجد وصفات بهذه الفلاتر.</p></div>'; return; }
    box.innerHTML = recipes.map(communityCard).join("");
  } catch (err) {
    box.innerHTML = `<div class="empty"><p class="muted">${escapeHtml(err.message)}</p></div>`;
  }
}

// filter controls
$$("[data-cf-kind]").forEach((btn) => {
  btn.addEventListener("click", () => {
    communityFilters.kind = btn.dataset.cfKind;
    $$("[data-cf-kind]").forEach((b) => b.classList.toggle("active", b.dataset.cfKind === communityFilters.kind));
    loadCommunity();
  });
});
$$("[data-cf-roast]").forEach((btn) => {
  btn.addEventListener("click", () => {
    communityFilters.roast = btn.dataset.cfRoast;
    $$("[data-cf-roast]").forEach((b) => b.classList.toggle("active", b.dataset.cfRoast === communityFilters.roast));
    loadCommunity();
  });
});
$$("[data-cf-process]").forEach((btn) => {
  btn.addEventListener("click", () => {
    communityFilters.process = btn.dataset.cfProcess;
    $$("[data-cf-process]").forEach((b) => b.classList.toggle("active", b.dataset.cfProcess === communityFilters.process));
    loadCommunity();
  });
});
$("#communitySearch").addEventListener("input", (e) => {
  communityFilters.search = e.target.value.trim();
  clearTimeout(communitySearchTimer);
  communitySearchTimer = setTimeout(loadCommunity, 400);
});
$("#reloadCommunity").addEventListener("click", loadCommunity);

// community list actions
$("#communityList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cact]");
  if (!btn) return;
  const card = btn.closest("[data-cid]");
  const id = card.dataset.cid;
  if (btn.dataset.cact === "like") {
    try {
      const r = await api(`/api/community/${id}/like`, { method: "POST" });
      btn.innerHTML = `<svg class="i" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ${r.likes}`;
      btn.style.color = "var(--danger)";
    } catch {}
    return;
  }
  if (btn.dataset.cact === "import") {
    // load the community recipe into the manual editor
    try {
      const { recipes } = await api(`/api/community`);
      const r = recipes.find((x) => x.id === id);
      if (!r) return;
      fillManualForm({
        kind: r.kind,
        name: r.name,
        dose_g: r.dose_g,
        ratio: r.ratio,
        color: r.color,
        grind_size: r.grind_size,
        grind_rpm: r.grind_rpm,
        pours: r.pours,
        steeps: r.steeps || r.pours,
      });
      showPanel("manual");
      toast(`استوردت وصفة "${r.name}"`);
    } catch (err) { toast(err.message, "bad"); }
  }
});

// --- boot ---
const savedProvider = localStorage.getItem("xbloom.provider");
if (savedProvider && (savedProvider === "ollama" || savedProvider === "openrouter")) {
  state.provider = savedProvider;
  $$("[data-provider]").forEach((b) => b.classList.toggle("active", b.dataset.provider === state.provider));
  if (state.provider === "openrouter") {
    $("#assistHint").textContent = "OpenRouter — سحابة، يدعم صور وموديلات متعددة";
  }
}
manual.steps = defaultSteps("coffee");
syncManual();
loadSettings();
initSettingsPanel();
refreshSession();
loadModels();

// ============================================================
// STATIC MODE — community seed + direct AI calls
// ============================================================

const COMMUNITY_SEED = [
  { id:"seed-1", name:"Ethiopian Yirgacheffe Natural", kind:"coffee", author:"CoffeeLover42", origin:"Ethiopia", region:"Yirgacheffe", process:"natural", roast:"light", company:"Nordic Roasters", dose_g:15, ratio:15, grind_size:62, grind_rpm:80, color:"#D4BFA0", notes:"Bright and fruity with blueberry notes. Natural process adds a wine-like complexity. Bloom is extended for fresh CO2 release.", pours:[{name:"Bloom",volume_ml:38,temperature_c:94,pattern:"circular",pause_seconds:45},{name:"Pour 2",volume_ml:87,temperature_c:94,pattern:"spiral",pause_seconds:30},{name:"Pour 3",volume_ml:100,temperature_c:94,pattern:"circular",pause_seconds:0}], likes:14, createdAt:"2025-01-10T10:00:00Z" },
  { id:"seed-2", name:"Colombian Huila Washed", kind:"coffee", author:"BrewMaster", origin:"Colombia", region:"Huila", process:"washed", roast:"medium", company:"Blue Bottle", dose_g:15, ratio:16, grind_size:72, grind_rpm:80, color:"#B9C4D8", notes:"Clean, balanced, caramel sweetness. Classic Colombian pour-over. Washed process gives clarity and brightness.", pours:[{name:"Bloom",volume_ml:38,temperature_c:91,pattern:"circular",pause_seconds:40},{name:"Pour 2",volume_ml:102,temperature_c:91,pattern:"circular",pause_seconds:20},{name:"Pour 3",volume_ml:100,temperature_c:91,pattern:"circular",pause_seconds:0}], likes:9, createdAt:"2025-01-15T12:00:00Z" },
  { id:"seed-3", name:"Japanese Sencha Green", kind:"tea", author:"TeaCeremony", origin:"Japan", region:"Shizuoka", process:"steamed", roast:null, company:"Ippodo", dose_g:4, ratio:17, color:"#A8C686", notes:"Umami-rich Japanese sencha. Lower temperature preserves sweetness and avoids bitterness.", steeps:[{volume_ml:70,temperature_c:72,steep_seconds:60},{volume_ml:70,temperature_c:74,steep_seconds:30},{volume_ml:70,temperature_c:78,steep_seconds:45}], likes:7, createdAt:"2025-01-20T08:00:00Z" },
  { id:"seed-4", name:"Brazilian Dark Roast", kind:"coffee", author:"DarkRoastFan", origin:"Brazil", region:"Cerrado", process:"natural", roast:"dark", company:"Stumptown", dose_g:18, ratio:14, grind_size:88, grind_rpm:75, color:"#6F4E37", notes:"Chocolate and nut forward. Lower ratio for strength, cooler water to avoid over-extraction.", pours:[{name:"Bloom",volume_ml:45,temperature_c:87,pattern:"centered",pause_seconds:25},{name:"Pour 2",volume_ml:100,temperature_c:87,pattern:"circular",pause_seconds:0},{name:"Pour 3",volume_ml:107,temperature_c:87,pattern:"circular",pause_seconds:0}], likes:11, createdAt:"2025-01-25T14:00:00Z" },
  { id:"seed-5", name:"Kenyan AA Washed Light", kind:"coffee", author:"AcidityFan", origin:"Kenya", region:"Kirinyaga", process:"washed", roast:"light", company:"Counter Culture", dose_g:14, ratio:16, grind_size:60, grind_rpm:85, color:"#C9A9A9", notes:"Intense blackcurrant and tomato. Kenyan AA needs fine grind and high temp.", pours:[{name:"Bloom",volume_ml:35,temperature_c:95,pattern:"circular",pause_seconds:45},{name:"Pour 2",volume_ml:75,temperature_c:95,pattern:"spiral",pause_seconds:30},{name:"Pour 3",volume_ml:75,temperature_c:94,pattern:"spiral",pause_seconds:20},{name:"Pour 4",volume_ml:39,temperature_c:93,pattern:"circular",pause_seconds:0}], likes:6, createdAt:"2025-02-01T09:00:00Z" },
  { id:"seed-6", name:"Taiwanese High Mountain Oolong", kind:"tea", author:"TeaMaster88", origin:"Taiwan", region:"Ali Shan", process:"partially_oxidized", roast:null, company:"Ten Ren", dose_g:5, ratio:14, color:"#D9C9A8", notes:"Floral and creamy Ali Shan oolong. Three short steeps to build complexity.", steeps:[{volume_ml:70,temperature_c:90,steep_seconds:45},{volume_ml:70,temperature_c:92,steep_seconds:60},{volume_ml:70,temperature_c:94,steep_seconds:90}], likes:5, createdAt:"2025-02-05T11:00:00Z" },
];

function getCommunityStatic() {
  let all = JSON.parse(localStorage.getItem("xbloom.community.static") || "null") || [...COMMUNITY_SEED];
  const f = communityFilters;
  if (f.kind !== "all") all = all.filter((r) => r.kind === f.kind);
  if (f.roast !== "all") all = all.filter((r) => r.roast === f.roast);
  if (f.process !== "all") all = all.filter((r) => r.process === f.process);
  if (f.search) {
    const q = f.search.toLowerCase();
    all = all.filter((r) => (r.origin || "").toLowerCase().includes(q) || (r.company || "").toLowerCase().includes(q));
  }
  return all.sort((a, b) => (b.likes || 0) - (a.likes || 0));
}

function publishCommunityStatic(spec) {
  const all = JSON.parse(localStorage.getItem("xbloom.community.static") || "null") || [...COMMUNITY_SEED];
  const author = settings.name || "مستخدم";
  const entry = { ...spec, id: `user-${Date.now()}`, author, likes: 0, createdAt: new Date().toISOString() };
  all.unshift(entry);
  localStorage.setItem("xbloom.community.static", JSON.stringify(all));
  return entry;
}

// System prompt for static AI calls (same as server/prompt.js)
const STATIC_SYSTEM_PROMPT = `You are an expert coffee and tea brewing assistant for the XBloom Studio machine (Omni dripper + Omni Tea Brewer).
HARDWARE LIMITS: Coffee: dose_g 1-31 | ratio 8-20 | grind_size 40-120 (LOWER=FINER) | grind_rpm 60-120 | temp 40-95 | pause 0-255 | pattern centered|circular|spiral | 2-7 pours. Tea: dose_g 1-10 | vol 1-90 per steep | temp 65-100 | steep_seconds 0-360 | 1-3 steeps.
GRIND: 40-55 very fine | 56-70 fine-medium | 71-85 medium | 86-100 medium-coarse | 101-120 coarse.
ROAST TABLE: Very light 94-95°C grind 50-62 ratio 1:15-16 | Light 90-93°C grind 58-68 ratio 1:15 | Medium 88-91°C grind 70-80 ratio 1:15-16 | Dark 85-88°C grind 82-95 ratio 1:16-17.
PROCESS ADJUSTMENTS: Washed/dense: grind 3-5 finer | Natural/honey/anaerobic: grind 3-5 coarser | Fresh<7days: bloom x2.5 dose 35-45s.
COFFEE STEPS: dose_g TOTAL at top level. Sum of pour volumes = dose_g*ratio ±5%. Bloom = first pour 2-2.5x dose, long pause. 2-7 pours total.
TEA: dose_g = total leaf weight. Green 70-80°C. White 75-85°C. Oolong 85-95°C. Black 90-100°C. Herbal 100°C. 1-3 steeps.
DIAL-IN: sour/under = finer+hotter | bitter/over = coarser+cooler | weak = higher ratio | strong = lower ratio.
OUTPUT: Reply with ONE raw JSON object only. No markdown, no text outside JSON. Use "kind":"coffee"+"pours" OR "kind":"tea"+"steeps". Include "name","dose_g","ratio","notes"(1 paragraph).`;

async function runAssistStatic(text, image, liveEl, timerEl, onToken, onRecipe, onError) {
  const model = $("#modelSelect").value || OR_DEFAULT_MODELS[0].id;
  const isOR = state.provider === "openrouter";

  if (isOR && !settings.orKey) { onError("أضف مفتاح OpenRouter في الإعدادات"); return; }
  if (!isOR && !settings.ollamaUrl) { onError("أضف رابط Ollama في الإعدادات"); return; }

  const messages = [
    { role: "system", content: STATIC_SYSTEM_PROMPT },
    ...state.history.slice(0, -1).slice(-4),
    { role: "user", content: buildUserContent(text, image) },
  ];

  let fullText = "";
  try {
    if (isOR) {
      const body = { model, messages, temperature: 0.5, stream: true };
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.orKey}`,
          "HTTP-Referer": location.origin,
          "X-Title": "XBloom Studio",
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`OpenRouter ${resp.status}`);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") break;
          try {
            const token = JSON.parse(payload).choices?.[0]?.delta?.content ?? "";
            if (token) { fullText += token; onToken(token); liveEl.querySelector("p:last-child")?.appendChild(timerEl); }
          } catch { /* partial */ }
        }
      }
    } else {
      // Ollama direct
      const resp = await fetch(`${settings.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true }),
      });
      if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const token = JSON.parse(line).message?.content ?? "";
            if (token) { fullText += token; onToken(token); liveEl.querySelector("p:last-child")?.appendChild(timerEl); }
          } catch { /* partial */ }
        }
      }
    }
    // Extract recipe JSON from fullText
    const recipe = extractRecipeJson(fullText);
    if (recipe) onRecipe(recipe);
    else onToken("\n\n(لم يُعيد الموديل وصفة JSON واضحة)");
  } catch (err) {
    onError(String(err.message || err));
  }
}

function buildUserContent(text, image) {
  if (!image) return text || "(attached image)";
  return [
    { type: "text", text: text || "(attached a photo of the coffee bag)" },
    { type: "image_url", image_url: { url: image } },
  ];
}

function normalizeRecipe(r) {
  if (!r) return r;
  const out = { ...r };
  // normalize top-level numeric fields
  out.dose_g = Number(out.dose_g || out.dose || 15);
  out.ratio  = Number(out.ratio || out.water_ratio || 15);
  out.grind_size = Number(out.grind_size ?? out.grind ?? 70);
  out.grind_rpm  = Number(out.grind_rpm  ?? out.rpm   ?? 80);
  out.color = out.color || (out.kind === "tea" ? "#A8C686" : "#B9C4D8");
  const totalWater = out.dose_g * out.ratio;

  if (out.kind === "tea") {
    const raw = out.steeps || out.steps || out.pours || [];
    out.steeps = raw.map((s) => ({
      volume_ml:      Number(s.volume_ml ?? s.water_ml ?? s.water ?? s.volume ?? Math.round(totalWater / raw.length)),
      temperature_c:  Number(s.temperature_c ?? s.temperature ?? s.temp ?? 85),
      steep_seconds:  Number(s.steep_seconds ?? s.steep ?? s.time ?? s.duration ?? 60),
    }));
    delete out.pours;
  } else {
    const raw = out.pours || out.steps || out.pouring_steps || [];
    // if AIs omit per-pour volumes, distribute total water
    const hasVols = raw.some((s) => s.volume_ml ?? s.water ?? s.water_ml ?? s.volume);
    out.pours = raw.map((s, i) => {
      const vol = Number(s.volume_ml ?? s.water_ml ?? s.water ?? s.volume ??
        (i === 0 ? Math.round(out.dose_g * 2.5) : Math.round((totalWater - out.dose_g * 2.5) / Math.max(raw.length - 1, 1))));
      return {
        name:           s.name || s.step_name || (i === 0 ? "Bloom" : `Pour ${i + 1}`),
        volume_ml:      Math.max(vol, 5),
        temperature_c:  Number(s.temperature_c ?? s.temperature ?? s.temp ?? s.temp_c ?? 93),
        pause_seconds:  Number(s.pause_seconds ?? s.pause ?? s.rest ?? s.wait ?? (i === 0 ? 45 : 0)),
        pattern:        s.pattern || "circular",
      };
    });
    delete out.steeps;
  }
  return out;
}

function extractRecipeJson(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    if (obj.kind && (obj.dose_g || obj.dose) && (obj.ratio || obj.water_ratio)) return normalizeRecipe(obj);
  } catch { /* bad json */ }
  return null;
}
