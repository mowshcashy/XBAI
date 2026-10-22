// XBloom client — Node port of the Edge Function logic.
// Handles RSA login, encrypted recipe CRUD, and share-link import.

const API_BASE = "https://client-api.xbloom.com";
const SHARE_BASE = "https://share-h5.xbloom.com";

const RSA_PUBLIC_KEY_B64 =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4LF40GZ72SdhMyl765K/i4nY5" +
  "CPcHz2Q1IKWKZ9S79xmK7G8pUhbVf4EZLvnNF1+9IvOFQUKV5Z7ZNNviqSpnql9" +
  "tAT+8+J/He0R7pcirvVSxgdr2i9V/C/gmqAEZ5qVTzRnd3uWdFoKzPdEBxP0Ipor" +
  "J1VBbCv90yBSOhVxO+QIDAQAB";

const RSA_PUBLIC_KEY_PEM =
  "-----BEGIN PUBLIC KEY-----\n" +
  RSA_PUBLIC_KEY_B64.match(/.{1,64}/g).join("\n") +
  "\n-----END PUBLIC KEY-----";

const API_HEADERS = {
  "Content-Type": "application/json",
  Referer: `${SHARE_BASE}/`,
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
};

const PATTERN_MAP = { centered: 1, spiral: 2, circular: 3 };
const PATTERN_REV = { 1: "centered", 2: "spiral", 3: "circular" };

// --- RSA (hutool-style 117-byte chunking) ---
function rsaEncrypt(payload) {
  const { publicEncrypt, constants } = require("node:crypto");
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
  const chunkSize = 117;
  const chunks = [];
  for (let i = 0; i < plaintext.length; i += chunkSize) {
    chunks.push(
      publicEncrypt(
        { key: RSA_PUBLIC_KEY_PEM, padding: constants.RSA_PKCS1_PADDING },
        plaintext.subarray(i, i + chunkSize),
      ),
    );
  }
  return Buffer.concat(chunks).toString("base64");
}

async function postPlain(endpoint, payload) {
  try {
    const resp = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify(payload),
    });
    return await resp.json();
  } catch (e) {
    return { result: "error", error: String(e) };
  }
}

async function postEncrypted(endpoint, payload) {
  try {
    const resp = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify(rsaEncrypt(payload)),
    });
    return await resp.json();
  } catch (e) {
    return { result: "error", error: String(e) };
  }
}

// Pull a human-readable reason out of an XBloom failure envelope.
function xbloomFailure(resp) {
  const detail = [
    resp.msg, resp.message, resp.errorMsg, resp.errorMessage,
    resp.error, resp.reason, resp.tips, resp.info,
  ].find((v) => typeof v === "string" && v.trim());
  return detail || "XBloom request failed.";
}

// Error for an authenticated call; token/login failures are flagged 401 so the
// app can drop the stale session and ask the user to sign in again.
function authFailure(resp) {
  const err = new Error(xbloomFailure(resp));
  if (/token|log ?in|expired|登录/i.test(err.message)) err.status = 401;
  return err;
}

function authBase(creds) {
  return {
    interfaceVersion: 20240918,
    skey: "testskey",
    phoneType: "Android",
    memberId: creds.memberId,
    clientType: 2,
    languageType: 0, // 0 = English messages (1 is French)
    token: creds.token,
  };
}

// Clamp helper so a bad AI/UI value can never send an out-of-range recipe.
const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, lo), hi);
};

function buildPourList(pours) {
  return (pours || []).map((p, i) => ({
    theName: p.name || (i === 0 ? "Bloom" : `Pour ${i + 1}`),
    volume: clamp(p.volume_ml, 1, 250, 30),
    temperature: clamp(p.temperature_c, 40, 95, 93),
    flowRate: clamp(p.flow_rate, 3.0, 3.5, 3.0),
    pattern: PATTERN_MAP[p.pattern] ?? 3,
    pausing: clamp(p.pause_seconds, 0, 255, 0),
    isEnableVibrationBefore: p.agitate_before ? 1 : 2,
    isEnableVibrationAfter: p.agitate_after ? 1 : 2,
  }));
}

function buildSteepList(steeps) {
  return (steeps || []).slice(0, 3).map((s, i) => ({
    theName: `Steep ${i + 1}`,
    volume: clamp(s.volume_ml, 1, 90, 80),
    temperature: clamp(s.temperature_c, 65, 100, 85),
    flowRate: clamp(s.flow_rate, 3.0, 3.5, 3.0),
    pattern: 3,
    pausing: clamp(s.steep_seconds, 0, 360, 120),
    isEnableVibrationBefore: 2,
    isEnableVibrationAfter: 2,
  }));
}

async function login(email, password) {
  const resp = await postPlain("tMemberLogin.thtml", {
    interfaceVersion: 20240918,
    skey: "testskey",
    clientType: 2,
    phoneType: "Android",
    languageType: 0, // 0 = English messages (1 is French)
    email,
    password,
  });
  if (resp.result !== "success") throw new Error(xbloomFailure(resp));
  const member = resp.member;
  if (!member?.tableId || !resp.token) throw new Error("Login response was missing member id / token.");
  return { memberId: member.tableId, token: resp.token, email };
}

async function listRecipes(creds) {
  const resp = await postEncrypted("tuMyTeaRecipeCreated.tuhtml", {
    ...authBase(creds), pageNumber: 1, countPerPage: 100, adaptedModel: 1,
  });
  if (resp.result !== "success") throw authFailure(resp);
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

// Shared body for coffee/tea creation. Tea differs only in cupType and grinder flags.
async function addRecipe(creds, spec) {
  const isTea = spec.kind === "tea";
  const pourList = isTea ? buildSteepList(spec.steeps) : buildPourList(spec.pours);
  const payload = {
    ...authBase(creds),
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
    pourDataJSONStr: JSON.stringify(pourList),
  };
  const resp = await postEncrypted("tuRecipeAdd.tuhtml", payload);
  if (resp.result !== "success") throw authFailure(resp);
  const shareId = Buffer.from(String(resp.tableId)).toString("base64");
  return { id: resp.tableId, share_link: `${SHARE_BASE}/?id=${encodeURIComponent(shareId)}` };
}

// PATCH semantics: fetch the current row, overlay only the provided fields.
async function updateRecipe(creds, recipeId, patch) {
  const all = await listRecipes(creds);
  const current = all.find((r) => String(r.id) === String(recipeId));
  if (!current) throw new Error(`Recipe [${recipeId}] not found.`);

  const isTea = current.cup_type === "tea";
  const pick = (next, prev, lo, hi, fallback) =>
    next === undefined || next === null || next === "" ? prev : clamp(next, lo, hi, fallback);

  const payload = {
    ...authBase(creds),
    tableId: recipeId,
    theName: patch.name ?? current.name,
    dose: pick(patch.dose_g, current.dose_g, 1, isTea ? 10 : 31, current.dose_g),
    grandWater: pick(patch.ratio, current.ratio, 1, 40, current.ratio),
    grinderSize: isTea ? 50 : pick(patch.grind_size, current.grind_size, 40, 120, current.grind_size),
    rpm: isTea ? 60 : pick(patch.grind_rpm, current.grind_rpm, 60, 120, current.grind_rpm),
    theColor: patch.color ?? current.color ?? (isTea ? "#A8C686" : "#C9D5B8"),
    cupType: isTea ? 4 : 2,
    adaptedModel: 1,
    isEnableBypassWater: 2,
    isSetGrinderSize: isTea ? 2 : 1,
    theSubsetId: 0,
    bypassTemp: 85.0,
    bypassVolume: 5.0,
    subSetType: 2,
    appPlace: [4],
    isShortcuts: 2,
    createTimeStamp: Date.now(),
  };

  if (patch.pours) {
    payload.pourDataJSONStr = JSON.stringify(buildPourList(patch.pours));
  } else if (patch.steeps) {
    payload.pourDataJSONStr = JSON.stringify(buildSteepList(patch.steeps));
  } else {
    // Keep the existing pour data exactly as-is: round-trip through the same
    // builder used for creation so XBloom never receives undefined/NaN fields.
    payload.pourDataJSONStr = JSON.stringify(buildPourList(current.pours));
  }

  const resp = await postEncrypted("tuRecipeUpdate.tuhtml", payload);
  if (resp.result !== "success") throw authFailure(resp);
  return { id: recipeId };
}

async function deleteRecipe(creds, recipeId) {
  const resp = await postEncrypted("tuRecipeDelete.tuhtml", {
    ...authBase(creds), tableId: recipeId,
  });
  if (resp.result !== "success") throw authFailure(resp);
  return { id: recipeId };
}

async function fetchSharedRecipe(shareUrl) {
  let shareId = String(shareUrl || "").trim();
  if (shareId.includes("share-h5.xbloom.com")) {
    shareId = new URL(shareId).searchParams.get("id") || "";
  }
  if (!shareId) throw new Error("Could not parse a share id from that URL.");

  const resp = await postPlain("RecipeDetail.html", {
    tableIdOfRSA: shareId, interfaceVersion: 19700101, skey: "testskey",
  });
  if (resp.result !== "success") throw new Error(xbloomFailure(resp));

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
    steeps: isTea
      ? steps.map((s) => ({
          volume_ml: s.volume_ml,
          temperature_c: s.temperature_c,
          steep_seconds: s.pause_seconds,
          flow_rate: s.flow_rate,
        }))
      : undefined,
  };
}

module.exports = {
  login, listRecipes, addRecipe, updateRecipe, deleteRecipe, fetchSharedRecipe,
};
