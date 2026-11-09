// Hardware lab — finds the XBloom Studio's real limits beyond the official app.
// Acceptance tests load a recipe and cancel before anything grinds or pours (no water,
// no beans). Real tests run the pour head / grinder briefly and measure what happened.
(function () {
  const BLE = window.XBBle;
  if (!BLE?.lab || !document.getElementById("labCard")) return;
  const L = BLE.lab;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const base = () => ({
    dose_g: 15, grind_size: 50, grind_rpm: 100,
    pours: [
      { volume_ml: 40, temperature_c: 92, pattern: "spiral", pause_seconds: 20, flow_rate: 3 },
      { volume_ml: 185, temperature_c: 92, pattern: "circular", pause_seconds: 0, flow_rate: 3 },
    ],
  });
  const withPours = (f) => { const s = base(); s.pours = s.pours.map(f); return s; };
  const nPours = (n) => { const s = base(); const v = Math.round(225 / n); s.pours = Array.from({ length: n }, (_, k) => ({ volume_ml: v, temperature_c: 92, pattern: k ? "circular" : "spiral", pause_seconds: k < n - 1 ? 5 : 0, flow_rate: 3 })); return s; };

  // [group, label, spec builder, official?]
  const ACCEPT = [
    ["أساس", "وصفة عادية (لازم يقبلها)", base],
    ...[0, 81, 90, 100, 120, 150].map((g) => ["الطحن", `درجة ${g}`, () => ({ ...base(), grind_size: g })]),
    ...[30, 96, 98, 100].map((t) => ["الحرارة", `${t}°`, () => withPours((p) => ({ ...p, temperature_c: t }))]),
    ...[1.5, 2, 2.5, 4, 5].map((f) => ["التدفق", `${f} ml/s`, () => withPours((p) => ({ ...p, flow_rate: f }))]),
    ...[40, 50, 130, 150, 200].map((r) => ["سرعة الطاحونة", `${r} RPM`, () => ({ ...base(), grind_rpm: r })]),
    ...[100, 120, 127].map((p) => ["الانتظار", `${p} ثانية`, () => withPours((q, k) => (k === 0 ? { ...q, pause_seconds: p } : q))]),
    ...[32, 40, 50].map((d) => ["الجرعة", `${d}g`, () => ({ ...base(), dose_g: d, pours: base().pours.map((p, k) => ({ ...p, volume_ml: k ? d * 15 - 40 : 40 })) })]),
    ...[8, 10, 12, 16].map((n) => ["عدد الصبات", `${n} صبات`, () => nPours(n)]),
    ...[[3, 0], [4, 0], [1, 1], [0, 2], [2, 1], [1, 2]].map((c) => ["أنماط الصب", `كود ${c.join("/")}`, () => withPours((p) => ({ ...p, codes: c }))]),
    ...[400, 600].map((ml) => ["كمية الماء", `${ml}ml لـ 15g`, () => withPours((p, k) => ({ ...p, volume_ml: k ? ml - 40 : 40 }))]),
  ];

  const REAL = [
    ...[1.5, 2, 3, 4, 5].map((f) => ({ group: "التدفق الفعلي", label: `صب 60ml على ${f} ml/s`, kind: "pour", args: { volume: 60, temp: 85, flow: f, pattern: 1 } })),
    ...[97, 100].map((t) => ({ group: "الحرارة الفعلية", label: `صب 40ml على ${t}°`, kind: "pour", args: { volume: 40, temp: t, flow: 3, pattern: 1 } })),
    ...[3, 4, 5].map((c) => ({ group: "أنماط مخفية", label: `صب 40ml بنمط كود ${c} (راقب الرأس)`, kind: "pour", args: { volume: 40, temp: 85, flow: 3, pattern: c } })),
    ...[1, 2].map((x) => ({ group: "حقل مجهول", label: `صب 40ml والحقل المجهول = ${x}`, kind: "pour", args: { volume: 40, temp: 85, flow: 3, pattern: 1, extra: x } })),
    ...[[100, 100], [120, 100], [50, 40], [50, 150]].map(([g, r]) => ({ group: "الطاحونة فاضية", label: `طحن 2ث درجة ${g} على ${r} RPM`, kind: "grind", args: { size: g, rpm: r, ms: 2000 } })),
  ];

  const results = [];
  const frames = new Map();
  BLE.on("frame", (f) => {
    const key = `${f.kind}:${f.code}`;
    const e = frames.get(key) || { kind: f.kind, code: f.code, count: 0, sample: f.hex };
    e.count++; frames.set(key, e);
  });

  const $l = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let stop = false, busy = false;

  function render() {
    const groups = {};
    results.forEach((r) => (groups[r.group] ||= []).push(r));
    $l("labResults").innerHTML = Object.entries(groups).map(([g, rs]) => `
      <div class="lab-group"><h3>${esc(g)}</h3>
        ${rs.map((r) => `<div class="lab-row ${r.ok === true ? "ok" : r.ok === false ? "bad" : ""}">
          <span>${esc(r.label)}</span><b>${esc(r.verdict)}</b>${r.detail ? `<small>${esc(r.detail)}</small>` : ""}</div>`).join("")}
      </div>`).join("") || `<p class="muted small">ما فيه نتائج بعد.</p>`;
    $l("labFrames").textContent = `أكواد وصلت من الجهاز: ${frames.size}`;
  }

  function setBusy(b, msg = "") {
    busy = b;
    $l("labAccept").disabled = b; $l("labStop").disabled = !b;
    document.querySelectorAll("#labReal [data-real]").forEach((x) => { x.disabled = b; });
    $l("labStatus").textContent = msg;
  }

  async function runAccept() {
    if (!BLE.supported()) { toast("Bluetooth غير متاح في هذا المتصفح", "bad"); return; }
    stop = false; setBusy(true, "جاري الاتصال…");
    try {
      await BLE.connect();
      for (let k = 0; k < ACCEPT.length && !stop; k++) {
        const [group, label, make] = ACCEPT[k];
        setBusy(true, `فحص ${k + 1} من ${ACCEPT.length}: ${group} · ${label}`);
        let row;
        try {
          const r = await L.accept(make());
          const err = r.events.filter((c) => c === 8204 || c === 8203);
          row = { group, label, ok: r.accepted && !err.length, verdict: r.accepted ? (err.length ? "قبلها مع خطأ" : "قبلها") : "رفضها",
            detail: [r.states.length ? `حالات: ${[...new Set(r.states)].map((c) => "0x" + c.toString(16)).join(" ")}` : "", r.events.length ? `أحداث: ${r.events.join(" ")}` : ""].filter(Boolean).join(" · "),
            test: "accept", sent: r.sent };
        } catch (e) {
          row = { group, label, ok: false, verdict: "خطأ اتصال", detail: e?.message || "", test: "accept" };
        }
        results.push(row); render();
        if (k === 0 && !row.ok) { toast("الجهاز رفض الوصفة العادية — قفّل تطبيق XBloom وأعد المحاولة", "bad"); break; }
        await sleep(600);
      }
    } catch (e) { toast(e?.message || "تعذّر الاتصال", "bad"); }
    setBusy(false, stop ? "وقّفت الفحص" : "خلص فحص القبول");
  }

  // Watch telemetry while a real test runs; report flow (ml/s), peak temp, events.
  async function measure(fn, ms) {
    const samples = [], temps = [], events = [];
    const offW = BLE.on("weight", (d) => samples.push({ t: d.t, w: d.water ?? null, c: d.coffee ?? null }));
    const offT = BLE.on("temp", (d) => temps.push(d.temp));
    const offE = BLE.on("event", (d) => events.push(d.code));
    try { await fn(); for (let t = 0; t < ms && !stop; t += 250) await sleep(250); }
    finally { offW(); offT(); offE(); }
    const series = (key) => samples.filter((s) => s[key] != null).map((s) => ({ t: s.t, v: s[key] }));
    const rate = (pts) => {
      if (pts.length < 4) return null;
      const max = Math.max(...pts.map((p) => p.v));
      if (max < 5) return null;
      const a = pts.find((p) => p.v >= max * 0.1), b = pts.find((p) => p.v >= max * 0.9);
      return a && b && b.t > a.t ? ((b.v - a.v) / ((b.t - a.t) / 1000)) : null;
    };
    const flow = rate(series("w")) ?? rate(series("c"));
    const total = Math.max(0, ...series("w").map((p) => p.v), ...series("c").map((p) => p.v));
    return { flow, total, peakTemp: temps.length ? Math.max(...temps) : null, events, n: samples.length };
  }

  async function runReal(test) {
    const msg = test.kind === "grind"
      ? `بتشتغل الطاحونة فاضية ثانيتين (درجة ${test.args.size}، ${test.args.rpm} RPM). تأكد ما فيها بن.`
      : `بيصب ${test.args.volume}ml ماء حار. حط الدريبر مع فلتر والكوب تحته.`;
    if (!confirm(msg)) return;
    stop = false; setBusy(true, `جاري: ${test.label}`);
    try {
      await BLE.connect();
      const m = await measure(() => (test.kind === "grind" ? L.grind(test.args) : L.pour(test.args)), test.kind === "grind" ? 3000 : Math.max(20000, (test.args.volume / Math.max(1, test.args.flow)) * 1000 + 8000));
      const asked = test.kind === "pour" ? test.args.flow : null;
      const bits = [];
      if (m.flow != null) bits.push(`تدفق مقاس ${m.flow.toFixed(2)} ml/s${asked ? ` (المطلوب ${asked})` : ""}`);
      if (m.total) bits.push(`الكمية ${m.total.toFixed(0)}`);
      if (m.peakTemp != null) bits.push(`أعلى حرارة ${m.peakTemp.toFixed(1)}°`);
      if (m.events.length) bits.push(`أحداث: ${m.events.join(" ")}`);
      if (!m.n) bits.push("ما وصل وزن من الميزان");
      const ok = test.kind === "grind" ? !m.events.some((c) => c >= 8200 && c < 8300) : m.total > 5;
      results.push({ group: test.group, label: test.label, ok, verdict: test.kind === "grind" ? "اشتغلت" : ok ? "صب" : "ما صب", detail: bits.join(" · "), test: test.kind, args: test.args, measured: m });
    } catch (e) {
      results.push({ group: test.group, label: test.label, ok: false, verdict: "خطأ", detail: e?.message || "", test: test.kind, args: test.args });
    }
    render(); setBusy(false, "");
  }

  $l("labReal").innerHTML = REAL.map((t, k) => `<button type="button" class="btn" data-real="${k}"><span>${esc(t.group)}</span>${esc(t.label)}</button>`).join("");
  $l("labReal").addEventListener("click", (e) => { const b = e.target.closest("[data-real]"); if (b && !busy) runReal(REAL[Number(b.dataset.real)]); });
  $l("labAccept").addEventListener("click", () => { if (!busy) runAccept(); });
  $l("labStop").addEventListener("click", async () => { stop = true; try { await L.stopAll(); } catch {} });

  const report = () => JSON.stringify({
    app: "XBAI lab", at: new Date().toISOString(), device: BLE.live.info || null,
    results, frames: [...frames.values()].sort((a, b) => b.count - a.count),
  }, null, 1);
  $l("labCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(report()); toast("نسخت النتائج"); } catch { toast("ما قدرت أنسخ — استخدم التحميل", "bad"); }
  });
  $l("labSave").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([report()], { type: "application/json" }));
    a.download = `xbai-lab-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  render();
  setBusy(false, "");
})();
