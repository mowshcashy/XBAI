// Web Bluetooth driver for the xBloom Studio — the whole machine from the browser:
// load + brew recipes, manual grinder / brewer / dripper control, and the live
// telemetry the official app graphs (water + coffee weight, temperature, events).
//
// Byte-exact port of the reverse-engineered protocol documented in
// matthewnitschke/xbloom-api-doc and Janczykkkko/xbloom-ble (verified on V12.0D.500).
// Recipe load/commit/start/cancel frames match vendor captures byte-for-byte; the
// manual-control frames follow the same documented encoding but are less tested.
(function () {
  const SERVICE = "0000e0ff-3c17-d293-8e48-14fe2e4da212";
  const CHAR_CMD = "0000ffe1-0000-1000-8000-00805f9b34fb";
  const CHAR_STATUS = "0000ffe2-0000-1000-8000-00805f9b34fb";
  const LOAD_SEQ = 0x1f, BREW_SEQ = 0x9e;

  const STATE = {
    0x01: "الجهاز جاهز", 0x0c: "لا يوجد ماء في الخزان", 0x0f: "الجهاز يحتاج بن",
    0x10: "جاري الصب…", 0x1d: "الجهاز يستلم الوصفة…", 0x1f: "الوصفة محمّلة على الجهاز",
    0x1e: "بانتظار التأكيد…", 0x22: "جاري الطحن…", 0x23: "جاري الصب…",
    0x24: "القهوة جاهزة ☕", 0x3b: "جاري التحضير…", 0x41: "اكتمل التحضير ☕",
  };
  // Classic response codes the machine sends during a brew or manual control.
  const EVENTS = {
    9000: "الدريبر عند الطاحونة", 9001: "الدريبر عند الصب", 9002: "الدريبر عند الميزان",
    9003: "بدأ الطحن", 9004: "خرج من الطاحونة", 9005: "بدأ الصب", 9006: "خرج من الصب",
    9009: "الطحن متوقف مؤقتاً", 9010: "الصب متوقف مؤقتاً",
    40502: "بدأت الوصفة", 40507: "انتهى الطحن", 40510: "مرحلة البلوم", 40511: "انتهى الصب",
    40512: "القهوة جاهزة ☕", 40513: "القهوة جاهزة ☕",
    40517: "ما فيه بن في الطاحونة", 40522: "الخزان فاضي", 8203: "خطأ في موضع الدريبر", 8204: "الجرعة أو الماء غير صالحة",
  };
  const ERROR_EVENTS = new Set([40517, 40522, 8203, 8204]);
  const ACTED = new Set([0x22, 0x3b, 0x10, 0x23, 0x0c, 0x0f]);
  const REFUSED = { 0x0c: "لا يوجد ماء في الخزان — عبّئ الخزان وحاول مرة ثانية", 0x0f: "الجهاز يحتاج بن — حط البن وحاول مرة ثانية" };
  const TERMINAL = new Set([0x24, 0x41]);

  // ---------- frames ----------
  function crc16kermit(bytes) {
    let crc = 0;
    for (const b of bytes) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
    }
    return crc & 0xffff;
  }

  function frame(cmd, seq, payload) {
    const body = [0x58, 0x01, 0x01, cmd, seq, 0, 0, 0, 0, ...payload];
    const total = body.length + 2;
    body[5] = total & 0xff;
    body[6] = (total >> 8) & 0xff;
    const crc = crc16kermit(body);
    return new Uint8Array([...body, crc & 0xff, crc >> 8]);
  }
  // 16-bit command codes (e.g. 8006) are the same frame: low byte = opcode, high byte = seq.
  const frame16 = (code, payload = [0x01]) => frame(code & 0xff, (code >> 8) & 0xff, payload);

  const f32 = (v) => [...new Uint8Array(new Float32Array([v]).buffer)];
  const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  const clampInt = (v, lo, hi, fb) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : fb; };

  const PATTERNS = { spiral: "spiral", circular: "ring", ring: "ring", centered: "center", center: "center" };
  const PATTERN_CODES = { "spiral|true": [2, 2], "spiral|false": [2, 0], "ring|false": [1, 0], "center|false": [0, 1] };
  const MANUAL_PATTERN = { centered: 0, center: 0, circular: 1, ring: 1, spiral: 2 };

  // Our recipe spec → protocol recipe (machine-valid ranges).
  function toMachine(spec) {
    const dose = clampInt(spec.dose_g, 1, 31, 15); // same ceiling as XBloom recipes (library goes to 30g)
    const rpm = Math.round(clampInt(spec.grind_rpm, 60, 120, 80) / 10) * 10;
    const pours = (spec.pours || []).map((p, i) => {
      const pattern = PATTERNS[p.pattern] || "spiral";
      return {
        ml: clampInt(p.volume_ml, 1, 4000, 30),
        temp: clampInt(p.temperature_c, 40, 95, 93),
        pattern,
        agitation: pattern === "spiral" && !!(p.agitate_before || p.agitate_after),
        pause: clampInt(p.pause_seconds, 0, 99, 0),
        rpm: i === 0 && pattern !== "center" ? rpm : 0,
        flow10: clampInt(Number(p.flow_rate || 3.0) * 10, 30, 35, 30),
      };
    });
    return { dose, grind: clampInt(spec.grind_size, 1, 80, 55), pours };
  }

  function poursPayload(r) {
    const body = [];
    for (const p of r.pours) {
      const [pat, agit] = PATTERN_CODES[`${p.pattern}|${p.agitation}`];
      let rest = p.ml;
      while (rest > 127) { body.push(127, p.temp, pat, agit); rest -= 127; }
      body.push(rest, p.temp, pat, agit, (256 - p.pause) & 0xff, 0x00, p.rpm, p.flow10);
    }
    const total = r.pours.reduce((s, p) => s + p.ml, 0);
    const ratio = Math.round((total / r.dose) * 10) & 0xff;
    return [0x01, body.length & 0xff, ...body, r.grind & 0xff, ratio];
  }

  function loadFrames(r) {
    const dosePl = new Array(13).fill(0);
    dosePl[0] = 0x01;
    dosePl[9] = r.dose & 0xff;
    return [
      frame(0xa6, LOAD_SEQ, dosePl),
      frame(0xa8, LOAD_SEQ, [0x01, ...f32(110), ...f32(90)]),
      frame(0x41, LOAD_SEQ, poursPayload(r)),
    ];
  }
  const SESSION = () => frame(0xa4, LOAD_SEQ, [0x01, 0xb9, 0, 0, 0, 0x01, 0, 0, 0]);
  const HANDSHAKE = () => frame(0x56, LOAD_SEQ, [0x01]);
  const COMMIT = () => frame(0x42, LOAD_SEQ, [0x01]);
  const START = () => frame(0x46, BREW_SEQ, [0x01]);
  const CANCEL = () => frame(0x47, BREW_SEQ, [0x01]);

  // ---------- notifications ----------
  const bus = new EventTarget();
  const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
  const live = { state: null, water: null, coffee: null, temp: null, info: null };

  const f32At = (d, i) => (i + 4 <= d.length ? new DataView(d.buffer, d.byteOffset + i, 4).getFloat32(0, true) : NaN);
  const u32At = (d, i) => (i + 4 <= d.length ? new DataView(d.buffer, d.byteOffset + i, 4).getUint32(0, true) : NaN);
  const ascii = (d) => String.fromCharCode(...d).replace(/\0+/g, "").trim();

  function handleFrame(f) {
    if (f.length < 10) return;
    // Session frames: 58 02 07 | TYPE | SUB | LEN | C1 | payload
    if (f[1] === 0x02 && f[2] === 0x07) {
      const type = f[3];
      const m = f[9] === 0xc1 ? 9 : f.indexOf(0xc1, 5);
      if (m < 0) return;
      if (type === 0x4b || type === 0x15) {
        const g = f32At(f, m + 1) * (type === 0x4b ? 0.001 : 1);
        if (!(g >= 0 && g <= 2000)) return;
        if (type === 0x4b) live.water = g; else live.coffee = g;
        emit("weight", { water: live.water, coffee: live.coffee, t: performance.now() });
      } else if (type === 0x57) {
        const s = f[m + 1];
        live.state = s;
        emit("state", { code: s, label: STATE[s] || null });
      }
      return;
    }
    // Classic responses: 58 01 01 | code(u16) | LEN | marker | payload
    if (f[1] === 0x01 && f[2] === 0x01) {
      const code = f[3] | (f[4] << 8);
      const payload = f.subarray(10, f.length - 2);
      if (code === 8108) {
        const t = u32At(payload, 0) / 10;
        if (t > 0 && t < 120) { live.temp = t; emit("temp", { temp: t }); }
      } else if (code === 40521 && payload.length >= 29) {
        live.info = { serial: ascii(payload.subarray(0, 13)), model: ascii(payload.subarray(13, 19)), version: ascii(payload.subarray(19, 29)), waterOk: payload[33] !== 0 };
        emit("info", live.info);
      } else if (code === 20501 || code === 10507) {
        const g = f32At(payload, 0);
        if (g >= 0 && g <= 2000) { live.coffee = g; emit("weight", { water: live.water, coffee: g, t: performance.now() }); }
      }
      if (EVENTS[code]) emit("event", { code, label: EVENTS[code], error: ERROR_EVENTS.has(code) });
    }
  }

  // One BLE packet may carry several frames back to back; split on header + LEN.
  function onPacket(e) {
    const dv = e.target.value;
    const d = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    let i = 0;
    while (i + 10 <= d.length) {
      if (d[i] !== 0x58) { i++; continue; }
      const len = d[i + 5] | (d[i + 6] << 8);
      const end = len >= 10 && i + len <= d.length ? i + len : d.length;
      handleFrame(d.subarray(i, end));
      i = end;
    }
  }

  // ---------- connection ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let device = null, cmd = null, connecting = null;

  function supported() { return !!(navigator.bluetooth && window.isSecureContext); }
  function isConnected() { return !!(device?.gatt?.connected && cmd); }

  const write = (bytes) => (cmd.writeValueWithoutResponse ? cmd.writeValueWithoutResponse(bytes) : cmd.writeValue(bytes));

  // Must start inside a click handler: the first call opens the device chooser.
  function connect() {
    if (isConnected()) return Promise.resolve();
    if (connecting) return connecting;
    const pick = device
      ? Promise.resolve(device)
      : navigator.bluetooth.requestDevice({ filters: [{ namePrefix: "XBLOOM" }, { services: [SERVICE] }], optionalServices: [SERVICE] });
    connecting = (async () => {
      device = await pick;
      device.addEventListener("gattserverdisconnected", onDisconnected);
      emit("connection", { connected: false, connecting: true, name: device.name });
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService(SERVICE);
      cmd = await svc.getCharacteristic(CHAR_CMD);
      const status = await svc.getCharacteristic(CHAR_STATUS);
      status.addEventListener("characteristicvaluechanged", onPacket);
      await status.startNotifications();
      await write(SESSION()); await sleep(500);
      await write(HANDSHAKE()); await sleep(400);
      emit("connection", { connected: true, name: device.name });
    })().catch((err) => { cmd = null; emit("connection", { connected: false, error: err?.message }); throw err; })
      .finally(() => { connecting = null; });
    return connecting;
  }

  function onDisconnected() {
    cmd = null;
    emit("connection", { connected: false, name: device?.name });
  }

  function disconnect() {
    try { device?.gatt?.connected && device.gatt.disconnect(); } catch {}
    cmd = null;
  }

  // Resolves with the first state in `wanted`, or null after `ms`.
  function waitForState(wanted, ms) {
    return new Promise((resolve) => {
      const done = (v) => { clearTimeout(t); bus.removeEventListener("state", fn); bus.removeEventListener("abort", ab); resolve(v); };
      const fn = (e) => { if (wanted.has(e.detail.code)) done(e.detail.code); };
      const ab = () => done(-1);
      const t = setTimeout(() => done(null), ms);
      bus.addEventListener("state", fn);
      bus.addEventListener("abort", ab);
    });
  }

  // ---------- recipe brew ----------
  // Must be called from a click handler. Loads the recipe, commits + starts, and
  // resolves when the coffee is ready. Telemetry keeps flowing through on().
  function brew(spec, { onStatus = () => {} } = {}) {
    let cancelled = false;
    const conn = connect();
    const done = (async () => {
      const r = toMachine(spec);
      if (!r.pours.length) throw new Error("الوصفة ما فيها خطوات صب");
      onStatus("جاري الاتصال بالجهاز…");
      await conn;
      onStatus("جاري إرسال الوصفة…");
      await write(SESSION()); await sleep(500);
      await write(HANDSHAKE()); await sleep(2000);
      const armed = waitForState(new Set([0x1f]), 12000);
      for (const f of loadFrames(r)) { if (cancelled) return; await write(f); await sleep(400); }
      const a = await armed;
      if (cancelled || a === -1) return;
      if (!a) throw new Error("الجهاز ما قبل الوصفة — تأكد إن تطبيق XBloom مقفل في الجوال وحاول مرة ثانية");

      onStatus("جاري بدء التحضير…");
      let s = waitForState(ACTED, 8000);
      await write(COMMIT());
      let got = await s;
      if (got == null && !cancelled) {
        s = waitForState(ACTED, 6000);
        await write(START());
        got = await s;
      }
      if (REFUSED[got]) throw new Error(REFUSED[got]);
      const end = await waitForState(TERMINAL, 15 * 60 * 1000);
      if (end == null && !cancelled) onStatus("انتهى وقت المتابعة — تحقق من الجهاز");
    })();
    return {
      done,
      async cancel() {
        cancelled = true;
        emit("abort");
        try { if (isConnected()) await write(CANCEL()); } catch {}
      },
    };
  }

  // ---------- manual control (experimental) ----------
  const send = async (bytes) => { await connect(); await write(bytes); };

  const grinder = {
    async start({ size = 50, rpm = 100 } = {}) {
      await send(frame16(8006, [0x01, ...u32(clampInt(size, 1, 80, 50)), ...u32(Math.round(clampInt(rpm, 60, 120, 100) / 10) * 10)]));
      await sleep(2000);
      await write(frame16(3500));
    },
    stop: () => send(frame16(3505)),
    pause: () => send(frame16(8018)),
    resume: () => send(frame16(8020)),
    quit: () => send(frame16(8012)),
  };

  const brewer = {
    start({ volume = 100, temp = 93, flow = 3.0, pattern = "circular" } = {}) {
      const v = clampInt(volume, 5, 500, 100), t = clampInt(temp, 40, 95, 93);
      const fl = Math.min(3.5, Math.max(3.0, Number(flow) || 3.0));
      return send(frame16(4506, [0x01, ...f32(fl * 10), ...f32(v * 10), ...f32(t * 10), ...u32(0), ...u32(MANUAL_PATTERN[pattern] ?? 1)]));
    },
    stop: () => send(frame16(4507)),
    pause: () => send(frame16(8019)),
    resume: () => send(frame16(8021)),
    quit: () => send(frame16(8013)),
  };

  const dripper = {
    vibrate: () => send(frame16(2502)),
    left: () => send(frame16(2503)),
    right: () => send(frame16(2504)),
    stop: () => send(frame16(2505)),
  };

  window.XBBle = {
    supported, connect, disconnect, isConnected, brew, grinder, brewer, dripper,
    live, STATE,
    on: (type, fn) => { const h = (e) => fn(e.detail); bus.addEventListener(type, h); return () => bus.removeEventListener(type, h); },
    _frame: frame, _frame16: frame16, _toMachine: toMachine, _loadFrames: loadFrames, _handleFrame: handleFrame,
  };
})();
