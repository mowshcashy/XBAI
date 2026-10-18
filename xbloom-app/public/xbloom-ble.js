// Web Bluetooth driver for the xBloom Studio — brews straight from the phone's browser.
// Byte-exact port of the reverse-engineered protocol in Janczykkkko/xbloom-ble
// (protocol.py / client.py, verified on firmware V12.0D.500).
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
  const ACTED = new Set([0x22, 0x3b, 0x10, 0x23, 0x0c, 0x0f]);
  const REFUSED = { 0x0c: "لا يوجد ماء في الخزان — عبّئ الخزان وحاول مرة ثانية", 0x0f: "الجهاز يحتاج بن — حط البن وحاول مرة ثانية" };
  const TERMINAL = new Set([0x24, 0x41]);

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

  const f32 = (v) => [...new Uint8Array(new Float32Array([v]).buffer)];
  const clampInt = (v, lo, hi, fb) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : fb; };

  const PATTERNS = { spiral: "spiral", circular: "ring", ring: "ring", centered: "center", center: "center" };
  const PATTERN_CODES = { "spiral|true": [2, 2], "spiral|false": [2, 0], "ring|false": [1, 0], "center|false": [0, 1] };

  // Our recipe spec → protocol recipe (machine-valid ranges).
  function toMachine(spec) {
    const dose = clampInt(spec.dose_g, 1, 25, 15);
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
    return { dose, grind: clampInt(spec.grind_size, 1, 80, 60), pours };
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

  function parseState(dv) {
    const d = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    if (d.length < 11 || d[0] !== 0x58 || d[3] !== 0x57) return null;
    const m = d.indexOf(0xc1, 9);
    return m >= 0 && m + 1 < d.length - 2 ? d[m + 1] : null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let cachedDevice = null;

  function supported() { return !!(navigator.bluetooth && window.isSecureContext); }

  // Must be called from a click handler (Web Bluetooth needs a user gesture).
  function brew(spec, { onStatus = () => {} } = {}) {
    let cancelled = false, cmd = null, device = null;
    const listeners = new Set();

    const write = (bytes) => (cmd.writeValueWithoutResponse ? cmd.writeValueWithoutResponse(bytes) : cmd.writeValue(bytes));

    // Resolves with the first state in `wanted`, or null after `ms`.
    function waitFor(wanted, ms) {
      return new Promise((resolve) => {
        const t = setTimeout(() => { listeners.delete(fn); resolve(null); }, ms);
        const fn = (s) => { if (wanted.has(s)) { clearTimeout(t); listeners.delete(fn); resolve(s); } };
        listeners.add(fn);
      });
    }

    const pick = cachedDevice?.gatt
      ? Promise.resolve(cachedDevice)
      : navigator.bluetooth.requestDevice({ filters: [{ namePrefix: "XBLOOM" }, { services: [SERVICE] }], optionalServices: [SERVICE] });

    const done = (async () => {
      const r = toMachine(spec);
      if (!r.pours.length) throw new Error("الوصفة ما فيها خطوات صب");
      device = await pick;
      cachedDevice = device;
      onStatus("جاري الاتصال بالجهاز…");
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService(SERVICE);
      cmd = await svc.getCharacteristic(CHAR_CMD);
      const status = await svc.getCharacteristic(CHAR_STATUS);
      status.addEventListener("characteristicvaluechanged", (e) => {
        const s = parseState(e.target.value);
        if (s == null) return;
        if (STATE[s]) onStatus(STATE[s], s);
        listeners.forEach((fn) => fn(s));
      });
      await status.startNotifications();

      onStatus("جاري إرسال الوصفة…");
      await write(SESSION()); await sleep(500);
      await write(HANDSHAKE()); await sleep(2000);
      const armed = waitFor(new Set([0x1f]), 12000);
      for (const f of loadFrames(r)) { if (cancelled) return; await write(f); await sleep(400); }
      if (!(await armed)) throw new Error("الجهاز ما قبل الوصفة — تأكد إن تطبيق XBloom مقفل في الجوال وحاول مرة ثانية");
      if (cancelled) return;

      onStatus("جاري بدء التحضير…");
      let s = waitFor(ACTED, 8000);
      await write(COMMIT());
      let got = await s;
      if (got == null && !cancelled) {
        s = waitFor(ACTED, 6000);
        await write(START());
        got = await s;
      }
      if (REFUSED[got]) throw new Error(REFUSED[got]);

      const end = await waitFor(TERMINAL, 15 * 60 * 1000);
      if (end == null && !cancelled) onStatus("انتهى وقت المتابعة — تحقق من الجهاز");
    })().finally(() => { try { device?.gatt?.connected && device.gatt.disconnect(); } catch {} });

    return {
      done,
      async cancel() {
        cancelled = true;
        try { if (cmd) await write(CANCEL()); } catch {}
        listeners.forEach((fn) => fn(-1));
      },
    };
  }

  window.XBBle = { supported, brew, _frame: frame, _toMachine: toMachine, _loadFrames: loadFrames };
})();
