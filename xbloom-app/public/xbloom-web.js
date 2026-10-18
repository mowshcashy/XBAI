// Browser-side XBloom cloud client — the same calls server/xbloom.js makes,
// run directly from the page so the GitHub Pages build needs no server.
// client-api.xbloom.com allows cross-origin requests.
(function () {
  const API_BASE = "https://client-api.xbloom.com";
  const SHARE_BASE = "https://share-h5.xbloom.com";
  const FORGE_URL = "https://cdnjs.cloudflare.com/ajax/libs/forge/1.3.1/forge.min.js";
  const CREDS_KEY = "xbloom.web.creds";
  const RSA_PUBLIC_KEY_PEM =
    "-----BEGIN PUBLIC KEY-----\n" +
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4LF40GZ72SdhMyl765K/i4nY5\n" +
    "CPcHz2Q1IKWKZ9S79xmK7G8pUhbVf4EZLvnNF1+9IvOFQUKV5Z7ZNNviqSpnql9\n" +
    "tAT+8+J/He0R7pcirvVSxgdr2i9V/C/gmqAEZ5qVTzRnd3uWdFoKzPdEBxP0Ipor\n" +
    "J1VBbCv90yBSOhVxO+QIDAQAB\n" +
    "-----END PUBLIC KEY-----";
  const PATTERN_MAP = { centered: 1, spiral: 2, circular: 3 };
  const PATTERN_REV = { 1: "centered", 2: "spiral", 3: "circular" };

  let forgeReady = null;
  function loadForge() {
    if (window.forge) return Promise.resolve(window.forge);
    if (!forgeReady) {
      forgeReady = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = FORGE_URL;
        s.onload = () => resolve(window.forge);
        s.onerror = () => { forgeReady = null; reject(new Error("تعذّر تحميل مكتبة التشفير — تحقق من الإنترنت")); };
        document.head.appendChild(s);
      });
    }
    return forgeReady;
  }

  // hutool-style RSA: PKCS#1 v1.5 over 117-byte chunks, concatenated, base64.
  async function rsaEncrypt(payload) {
    const forge = await loadForge();
    const key = forge.pki.publicKeyFromPem(RSA_PUBLIC_KEY_PEM);
    const plain = forge.util.encodeUtf8(JSON.stringify(payload));
    let out = "";
    for (let i = 0; i < plain.length; i += 117) out += key.encrypt(plain.slice(i, i + 117), "RSAES-PKCS1-V1_5");
    return forge.util.encode64(out);
  }

  async function post(endpoint, body) {
    let resp;
    try {
      resp = await fetch(`${API_BASE}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("تعذّر الاتصال بسيرفر XBloom");
    }
    return resp.json().catch(() => ({}));
  }
  // XBloom answers a stale token with a 500 that carries no CORS headers, so the
  // browser only sees a network error — treat that as an expired session.
  async function postEncrypted(endpoint, payload) {
    const body = await rsaEncrypt(payload);
    try {
      return await post(endpoint, body);
    } catch {
      clearCreds();
      const e = new Error("انتهت جلسة XBloom — سجّل الدخول من جديد");
      e.status = 401;
      throw e;
    }
  }

  function failure(resp) {
    const d = [resp.msg, resp.message, resp.errorMsg, resp.errorMessage, resp.error, resp.reason, resp.tips, resp.info]
      .find((v) => typeof v === "string" && v.trim());
    return d || "فشل الطلب من XBloom";
  }
  function check(resp) {
    if (resp.result === "success") return resp;
    const err = new Error(failure(resp));
    if (/token|login|登录|expired/i.test(err.message)) { err.status = 401; clearCreds(); }
    throw err;
  }

  const loadCreds = () => { try { return JSON.parse(localStorage.getItem(CREDS_KEY) || "null"); } catch { return null; } };
  const saveCreds = (c) => { try { localStorage.setItem(CREDS_KEY, JSON.stringify(c)); } catch {} };
  function clearCreds() { try { localStorage.removeItem(CREDS_KEY); } catch {} }
  function requireCreds() {
    const c = loadCreds();
    if (!c?.token) { const e = new Error("Not logged in"); e.status = 401; throw e; }
    return c;
  }

  const authBase = (c) => ({
    interfaceVersion: 20240918, skey: "testskey", phoneType: "Android",
    memberId: c.memberId, clientType: 2, languageType: 1, token: c.token,
  });

  const clamp = (v, lo, hi, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : fb; };

  const buildPourList = (pours) => (pours || []).map((p, i) => ({
    theName: p.name || (i === 0 ? "Bloom" : `Pour ${i + 1}`),
    volume: clamp(p.volume_ml, 1, 250, 30),
    temperature: clamp(p.temperature_c, 40, 95, 93),
    flowRate: clamp(p.flow_rate, 3.0, 3.5, 3.0),
    pattern: PATTERN_MAP[p.pattern] ?? 3,
    pausing: clamp(p.pause_seconds, 0, 255, 0),
    isEnableVibrationBefore: p.agitate_before ? 1 : 2,
    isEnableVibrationAfter: p.agitate_after ? 1 : 2,
  }));

  const buildSteepList = (steeps) => (steeps || []).slice(0, 3).map((s, i) => ({
    theName: `Steep ${i + 1}`,
    volume: clamp(s.volume_ml, 1, 90, 80),
    temperature: clamp(s.temperature_c, 65, 100, 85),
    flowRate: clamp(s.flow_rate, 3.0, 3.5, 3.0),
    pattern: 3,
    pausing: clamp(s.steep_seconds, 0, 360, 120),
    isEnableVibrationBefore: 2,
    isEnableVibrationAfter: 2,
  }));

  async function login(email, password) {
    const resp = check(await post("tMemberLogin.thtml", {
      interfaceVersion: 20240918, skey: "testskey", clientType: 2,
      phoneType: "Android", languageType: 1, email, password,
    }));
    if (!resp.member?.tableId || !resp.token) throw new Error("رد تسجيل الدخول ناقص");
    const creds = { memberId: resp.member.tableId, token: resp.token, email };
    saveCreds(creds);
    return creds;
  }

  async function listRecipes() {
    const resp = check(await postEncrypted("tuMyTeaRecipeCreated.tuhtml", {
      ...authBase(requireCreds()), pageNumber: 1, countPerPage: 100, adaptedModel: 1,
    }));
    return (resp.list || []).map((r) => ({
      id: r.tableId,
      name: r.theName,
      dose_g: r.dose,
      ratio: r.grandWater,
      grind_size: r.grinderSize,
      grind_rpm: r.rpm,
      color: r.theColor,
      cup_type: Number(r.cupType) === 4 ? "tea" : "omni",
      share_link: r.shareRecipeLink || null,
      pours: (r.pourList || []).map((p) => ({
        name: p.theName,
        volume_ml: p.volume,
        temperature_c: p.temperature,
        pattern: PATTERN_REV[Number(p.pattern)] || "circular",
        flow_rate: p.flowRate,
        pause_seconds: p.pausing,
        agitate_before: Number(p.isEnableVibrationBefore) === 1,
        agitate_after: Number(p.isEnableVibrationAfter) === 1,
      })),
    }));
  }

  function recipePayload(c, spec, isTea) {
    return {
      ...authBase(c),
      theName: spec.name,
      dose: isTea ? clamp(spec.dose_g, 1, 10, 5) : clamp(spec.dose_g, 1, 31, 15),
      grandWater: clamp(spec.ratio, 1, isTea ? 99 : 40, 15),
      grinderSize: isTea ? 50 : clamp(spec.grind_size, 40, 120, 70),
      rpm: isTea ? 60 : clamp(spec.grind_rpm, 60, 120, 80),
      cupType: isTea ? 4 : 2,
      adaptedModel: 1,
      isEnableBypassWater: 2,
      isSetGrinderSize: isTea ? 2 : 1,
      theColor: spec.color || (isTea ? "#A8C686" : "#C9D5B8"),
      theSubsetId: 0,
      bypassTemp: 85.0,
      bypassVolume: 5.0,
      subSetType: 2,
      appPlace: [4],
      createTimeStamp: Date.now(),
      isShortcuts: 2,
      pourDataJSONStr: JSON.stringify(isTea ? buildSteepList(spec.steeps) : buildPourList(spec.pours)),
    };
  }

  async function addRecipe(spec) {
    const isTea = spec.kind === "tea";
    const resp = check(await postEncrypted("tuRecipeAdd.tuhtml", recipePayload(requireCreds(), spec, isTea)));
    return { id: resp.tableId, share_link: `${SHARE_BASE}/?id=${encodeURIComponent(btoa(String(resp.tableId)))}` };
  }

  async function updateRecipe(id, spec) {
    const isTea = spec.kind === "tea";
    check(await postEncrypted("tuRecipeUpdate.tuhtml", { ...recipePayload(requireCreds(), spec, isTea), tableId: id }));
    return { id };
  }

  async function deleteRecipe(id) {
    check(await postEncrypted("tuRecipeDelete.tuhtml", { ...authBase(requireCreds()), tableId: id }));
    return { id };
  }

  async function fetchSharedRecipe(shareUrl) {
    let shareId = String(shareUrl || "").trim();
    if (shareId.includes("share-h5.xbloom.com")) shareId = new URL(shareId).searchParams.get("id") || "";
    if (!shareId) throw new Error("رابط المشاركة غير صالح");
    const resp = check(await post("RecipeDetail.html", { tableIdOfRSA: shareId, interfaceVersion: 19700101, skey: "testskey" }));
    const rv = resp.recipeVo || {};
    const isTea = Number(rv.cupType) === 4;
    const steps = (rv.pourList || []).map((p) => ({
      volume_ml: p.volume ?? 30,
      temperature_c: p.temperature ?? 93,
      pattern: PATTERN_REV[Number(p.pattern ?? 2)] ?? "circular",
      flow_rate: p.flowRate ?? 3.0,
      pause_seconds: p.pausing ?? 0,
      agitate_before: Number(p.isEnableVibrationBefore) === 1,
      agitate_after: Number(p.isEnableVibrationAfter) === 1,
    }));
    return {
      kind: isTea ? "tea" : "coffee",
      name: rv.theName ?? "Imported Recipe",
      dose_g: rv.dose ?? 15,
      ratio: rv.grandWater ?? 15,
      grind_size: rv.grinderSize ?? 70,
      grind_rpm: rv.rpm ?? 80,
      color: rv.theColor ?? null,
      pours: isTea ? undefined : steps,
      steeps: isTea ? steps.map((s) => ({ volume_ml: s.volume_ml, temperature_c: s.temperature_c, steep_seconds: s.pause_seconds, flow_rate: s.flow_rate })) : undefined,
    };
  }

  // Mirrors the local server's /api routes so app.js can stay the same.
  async function route(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};
    const m = path.match(/^\/api\/recipes\/([^/?]+)/);
    if (path === "/api/session") { const c = loadCreds(); return { loggedIn: !!c?.token, email: c?.email ?? null }; }
    if (path === "/api/login") { const c = await login(body.email, body.password); return { ok: true, email: c.email }; }
    if (path === "/api/logout") { clearCreds(); return { ok: true }; }
    if (path === "/api/recipes" && method === "GET") return { recipes: await listRecipes() };
    if (path === "/api/recipes" && method === "POST") return addRecipe(body);
    if (m && method === "PUT") return updateRecipe(decodeURIComponent(m[1]), body);
    if (m && method === "DELETE") return deleteRecipe(decodeURIComponent(m[1]));
    if (path === "/api/import") return fetchSharedRecipe(body.share_url);
    return null;
  }

  window.XBWeb = { route, loggedIn: () => !!loadCreds()?.token };
})();
