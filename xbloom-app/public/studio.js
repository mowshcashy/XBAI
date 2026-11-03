// XBloom Studio — machine panel, live brew view, roasters' library, installable app.
// Loaded after app.js; uses its helpers ($, $$, toast, showPanel, renderPreview…).
(function () {
  const BLE = window.XBBle;
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const fmt1 = (v) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(1));

  // ════════════════ connection status ════════════════
  const bleReady = !!BLE?.supported();

  function setConn({ connected, connecting, name }) {
    $("#machineConnect").textContent = connected ? "قطع الاتصال" : connecting ? "جاري الاتصال…" : "اتصل بالجهاز";
    $("#mdState").textContent = connected ? `متصل بـ ${name || "XBloom"}` : connecting ? "جاري الاتصال…" : "غير متصل";
    $$(".mc-acts .btn").forEach((b) => { b.disabled = !connected; });
    const home = $("#homeLinkState");
    home.textContent = connected ? "متصل بالجهاز" : bleReady ? "Bluetooth جاهز" : "Bluetooth غير متاح";
    home.classList.toggle("on", connected || bleReady);
    const lc = $("#liveConn");
    lc.textContent = connected ? "متصل" : "غير متصل";
    lc.classList.toggle("on", !!connected);
  }
  setConn({ connected: false });

  // ════════════════ machine panel ════════════════
  function logEvent(label, error) {
    const list = $("#machineLog");
    if (list.firstElementChild?.classList.contains("muted")) list.innerHTML = "";
    const li = document.createElement("li");
    li.innerHTML = `<time class="num">${new Date().toLocaleTimeString("en-GB")}</time><span></span>`;
    li.lastChild.textContent = label;
    if (error) li.classList.add("bad");
    list.prepend(li);
    while (list.children.length > 12) list.lastChild.remove();
  }

  if (BLE) {
    BLE.on("connection", (d) => {
      setConn(d);
      if (d.error) toast(d.error.includes("cancel") ? "ما تم اختيار جهاز" : "تعذّر الاتصال بالجهاز", "bad");
      if (!d.connecting) logEvent(d.connected ? "اتصل الجهاز" : "انقطع الاتصال");
    });
    BLE.on("weight", (d) => {
      if (d.coffee != null) $("#mdCoffee").textContent = fmt1(d.coffee);
      if (d.water != null) $("#mdWater").textContent = fmt1(d.water);
    });
    BLE.on("temp", (d) => { $("#mdTemp").textContent = fmt1(d.temp); });
    BLE.on("state", (d) => { if (d.label && BLE.isConnected()) $("#mdState").textContent = d.label; });
    BLE.on("info", (d) => { $("#mdInfo").textContent = [d.model, d.version].filter(Boolean).join(" "); });
    BLE.on("event", (d) => {
      logEvent(d.label, d.error);
      if (d.error) toast(d.label, "bad");
    });
  }

  $("#machineConnect").addEventListener("click", () => {
    if (!bleReady) { $("#bleSetupModal").classList.remove("hidden"); return; }
    if (BLE.isConnected()) { BLE.disconnect(); return; }
    BLE.connect().catch(() => {});
  });

  // steppers + option segments inside the machine panel
  $$("#panel-machine .stepper[data-step]").forEach((st) => st.addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    const out = $(`#${st.dataset.step}`);
    const v = Number(out.textContent) + Number(b.dataset.d) * Number(st.dataset.inc);
    out.textContent = Math.min(Number(st.dataset.max), Math.max(Number(st.dataset.min), v));
  }));
  $$("[data-mopt] .opt-btn").forEach((b) => b.addEventListener("click", () => {
    b.parentElement.querySelectorAll(".opt-btn").forEach((x) => x.classList.toggle("active", x === b));
  }));
  const mopt = (name) => $(`[data-mopt="${name}"] .opt-btn.active`)?.dataset.v;
  const num = (id) => Number($(`#${id}`).textContent);

  async function run(label, fn) {
    try { await fn(); toast(label); } catch (err) { toast(err?.message || "تعذّر إرسال الأمر", "bad"); }
  }

  const GRINDER_LABELS = { start: "بدأ الطحن", pause: "توقف الطحن مؤقتاً", resume: "استأنف الطحن", stop: "وقف الطحن" };
  $$("[data-grinder]").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.grinder;
    run(GRINDER_LABELS[a], () => (a === "start" ? BLE.grinder.start({ size: num("grindSize"), rpm: Number(mopt("rpm")) }) : BLE.grinder[a]()));
  }));

  const BREWER_LABELS = { start: "بدأ الصب", pause: "توقف الصب مؤقتاً", resume: "استأنف الصب", stop: "وقف الصب" };
  $$("[data-brewer]").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.brewer;
    if (a === "start") {
      const volume = num("brewVol"), temp = num("brewTemp");
      if (!confirm(`بيصب ${volume}ml ماء على ${temp}°. تأكد إن الكوب والدريبر في مكانهم.`)) return;
      run(BREWER_LABELS.start, () => BLE.brewer.start({ volume, temp, flow: Number(mopt("flow")), pattern: mopt("pattern") }));
    } else {
      run(BREWER_LABELS[a], () => BLE.brewer[a]());
    }
  }));

  const DRIPPER_LABELS = { vibrate: "اهتز الدريبر", left: "تحرك الدريبر", right: "تحرك الدريبر", stop: "وقفت الحركة" };
  $$("[data-dripper]").forEach((b) => b.addEventListener("click", () => run(DRIPPER_LABELS[b.dataset.dripper], () => BLE.dripper[b.dataset.dripper]())));

  // home tiles jump to their card
  $$("#panel-home [data-focus]").forEach((t) => t.addEventListener("click", () => {
    setTimeout(() => $(`#${t.dataset.focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }));

  // ════════════════ live brew view ════════════════
  let live = null;
  const resumePill = document.createElement("button");
  resumePill.type = "button";
  resumePill.className = "live-resume hidden";
  resumePill.textContent = "التحضير شغّال. اضغط للعرض";
  document.body.appendChild(resumePill);
  resumePill.addEventListener("click", () => { $("#brewLive").classList.remove("hidden"); resumePill.classList.add("hidden"); });

  function schedule(spec) {
    let t = 0, cum = 0;
    return (spec.pours || []).map((p, i) => {
      const flow = Number(p.flow_rate) || 3;
      const dur = (Number(p.volume_ml) || 0) / flow;
      const step = { i, name: i === 0 ? "البلوم" : `صبّة ${i + 1}`, vol: Number(p.volume_ml) || 0, temp: p.temperature_c, start: t, end: t + dur, cumStart: cum, cumEnd: cum + (Number(p.volume_ml) || 0) };
      t += dur + (Number(p.pause_seconds) || 0);
      cum += step.vol;
      return step;
    });
  }
  // Water expected at time t (seconds since pouring began) when the scale stream is silent.
  function estimatedWater(steps, t) {
    let w = 0;
    for (const s of steps) {
      if (t >= s.end) w = s.cumEnd;
      else if (t > s.start) { w = s.cumStart + (s.vol * (t - s.start)) / (s.end - s.start); break; }
      else break;
    }
    return w;
  }

  function startLiveBrew(spec) {
    if (live?.job && !live.finished) { $("#brewLive").classList.remove("hidden"); return; }
    const steps = schedule(spec);
    const target = steps.length ? steps.at(-1).cumEnd : 0;
    live = { spec, steps, target, t0: null, pourT0: null, samples: [], water: 0, coffee: null, estimated: false, finished: false, unsubs: [] };

    $("#liveName").textContent = spec.name || "التحضير";
    $("#liveTarget").textContent = target;
    $("#liveWater").textContent = "0";
    $("#livePct").textContent = "0";
    $("#liveFlow").textContent = "—";
    $("#liveTemp").textContent = steps[0]?.temp ?? "—";
    $("#liveClock").textContent = "0:00";
    $("#livePhase").textContent = "جاري الاتصال…";
    $("#liveStop").classList.remove("hidden");
    $("#liveDone").classList.add("hidden");
    $("#liveSteps").innerHTML = steps.map((s) => `<li data-i="${s.i}"><b>${s.name}</b><span class="num">${s.vol}ml</span><span class="num">${s.temp}°</span></li>`).join("");
    $("#brewLive").classList.remove("hidden");
    resumePill.classList.add("hidden");
    requestAnimationFrame(drawChart);

    const phase = (text) => { $("#livePhase").textContent = text; };
    live.unsubs.push(
      BLE.on("weight", (d) => {
        if (!live || live.finished) return;
        if (d.water != null && d.water > 0.5) {
          if (!live.t0) live.t0 = performance.now();
          if (!live.pourT0) live.pourT0 = performance.now();
        }
        if (!live.t0) return;
        const t = (performance.now() - live.t0) / 1000;
        if (d.water != null) live.water = d.water;
        if (d.coffee != null) live.coffee = d.coffee;
        const last = live.samples.at(-1);
        if (!last || t - last.t >= 0.25) live.samples.push({ t, w: live.water, c: live.coffee });
        update();
      }),
      BLE.on("state", (d) => {
        if (!live || live.finished) return;
        if (d.label) phase(d.label);
        if ([0x22, 0x10, 0x23, 0x3b].includes(d.code) && !live.t0) live.t0 = performance.now();
        if ([0x10, 0x23, 0x3b].includes(d.code) && !live.pourT0) live.pourT0 = performance.now();
      }),
      BLE.on("temp", (d) => { if (live && !live.finished) $("#liveTemp").textContent = fmt1(d.temp); }),
      BLE.on("event", (d) => { if (live && !live.finished) phase(d.label); }),
      BLE.on("connection", (d) => { if (live && !live.finished && !d.connected && !d.connecting) phase("انقطع الاتصال بالجهاز"); }),
    );

    live.tick = setInterval(() => {
      if (!live?.t0 || live.finished) return;
      const t = (performance.now() - live.t0) / 1000;
      $("#liveClock").textContent = fmtTime(t);
      // No weights after 8 s of pouring → this firmware isn't streaming; follow the recipe's schedule instead.
      if (live.pourT0 && !live.samples.some((s) => s.w > 0.5) && (performance.now() - live.pourT0) / 1000 > 8) live.estimated = true;
      if (live.estimated) {
        live.water = estimatedWater(live.steps, (performance.now() - live.pourT0) / 1000);
        const last = live.samples.at(-1);
        if (!last || t - last.t >= 0.5) live.samples.push({ t, w: live.water, c: null });
      }
      update();
    }, 500);

    live.job = BLE.brew(spec, { onStatus: phase });
    live.job.done.then(() => finish(true, "القهوة جاهزة ☕ بالعافية")).catch((err) => {
      const msg = err?.name === "NotFoundError" ? "ما تم اختيار جهاز" : (err?.message || String(err));
      finish(false, msg);
    });
  }
  window.startLiveBrew = startLiveBrew;

  function update() {
    if (!live) return;
    const pct = live.target ? Math.min(100, Math.round((live.water / live.target) * 100)) : 0;
    $("#livePct").textContent = pct;
    $("#liveWater").textContent = Math.round(live.water);
    // flow = water slope over the last ~2 s
    const now = live.samples.at(-1);
    const past = now && [...live.samples].reverse().find((s) => now.t - s.t >= 2);
    if (now && past) $("#liveFlow").textContent = Math.max(0, (now.w - past.w) / (now.t - past.t)).toFixed(1);
    const cur = live.steps.findIndex((s) => live.water < s.cumEnd - 1);
    $$("#liveSteps li").forEach((li) => {
      const i = Number(li.dataset.i);
      li.classList.toggle("done", cur === -1 || i < cur);
      li.classList.toggle("on", i === cur);
    });
    $("#livePct").parentElement.dataset.est = live.estimated ? "تقديري" : "";
    drawChart();
  }

  function finish(ok, text) {
    if (!live || live.finished) return;
    live.finished = true;
    clearInterval(live.tick);
    live.unsubs.forEach((u) => u());
    if (ok && live.estimated) { live.water = live.target; update(); }
    $("#livePhase").textContent = text;
    $("#liveStop").classList.add("hidden");
    $("#liveDone").classList.remove("hidden");
    resumePill.classList.add("hidden");
    if (!$("#brewLive").classList.contains("hidden")) return;
    toast(text, ok ? undefined : "bad");
  }

  $("#liveStop").addEventListener("click", () => {
    if (!live?.job || live.finished) return;
    if (!confirm("توقف التحضير؟")) return;
    live.job.cancel();
    finish(false, "تم إيقاف التحضير");
  });
  $("#liveDone").addEventListener("click", () => { $("#brewLive").classList.add("hidden"); });
  $("#liveHide").addEventListener("click", () => {
    $("#brewLive").classList.add("hidden");
    if (live && !live.finished) resumePill.classList.remove("hidden");
  });

  // ---------- brew-record chart (water + coffee weight over time) ----------
  const WATER = "#0b45c5", COFFEE = "#c8641e";
  function niceMax(v) {
    const step = v > 400 ? 100 : 50;
    return Math.max(step, Math.ceil(v / step) * step);
  }

  function drawChart() {
    const svg = $("#liveChart");
    const W = svg.clientWidth || 320, H = 190;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const pad = { l: 34, r: 44, t: 10, b: 22 };
    const samples = live?.samples || [];
    const tMax = Math.max(60, (samples.at(-1)?.t || 0) * 1.1);
    const yMax = niceMax(Math.max(live?.target || 100, ...samples.map((s) => Math.max(s.w || 0, s.c || 0))) * 1.05);
    const x = (t) => pad.l + (t / tMax) * (W - pad.l - pad.r);
    const y = (v) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
    const step = yMax > 400 ? 100 : 50;
    let g = "";
    for (let v = 0; v <= yMax; v += step) {
      g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 6}" y="${y(v) + 3}" class="tick" text-anchor="end">${v}</text>`;
    }
    const tStep = tMax > 240 ? 60 : 30;
    for (let t = 0; t <= tMax; t += tStep) g += `<text x="${x(t)}" y="${H - 6}" class="tick" text-anchor="middle">${fmtTime(t)}</text>`;
    if (live?.target) g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(live.target)}" y2="${y(live.target)}" class="target"/><text x="${W - pad.r + 4}" y="${y(live.target) + 3}" class="tick">الهدف</text>`;
    const path = (key) => samples.filter((s) => s[key] != null).map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(s[key]).toFixed(1)}`).join("");
    const pw = path("w"), pc = path("c");
    if (pw) g += `<path d="${pw}" fill="none" stroke="${WATER}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (pc) g += `<path d="${pc}" fill="none" stroke="${COFFEE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = samples.at(-1);
    if (last && pw) g += `<circle cx="${x(last.t)}" cy="${y(last.w)}" r="4" fill="${WATER}" stroke="#fff" stroke-width="2"/><text x="${x(last.t) + 7}" y="${y(last.w) - 6}" class="dlabel">${Math.round(last.w)}g</text>`;
    const lastC = [...samples].reverse().find((s) => s.c != null);
    if (lastC && pc) g += `<circle cx="${x(lastC.t)}" cy="${y(lastC.c)}" r="4" fill="${COFFEE}" stroke="#fff" stroke-width="2"/><text x="${x(lastC.t) + 7}" y="${y(lastC.c) + 14}" class="dlabel">${Math.round(lastC.c)}g</text>`;
    if (!samples.length) g += `<text x="${(W + pad.l - pad.r) / 2}" y="${H / 2}" class="tick" text-anchor="middle">يبدأ الرسم أول ما ينزل الماء</text>`;
    g += `<line id="chartCross" class="cross hidden" y1="${pad.t}" y2="${H - pad.b}"/>`;
    svg.innerHTML = g;
    svg._scale = { x, tMax, pad, W };
  }

  // hover / touch readout
  {
    const svg = $("#liveChart"), tip = $("#liveTip");
    const show = (clientX) => {
      const s = svg._scale, samples = live?.samples || [];
      if (!s || !samples.length) return;
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * s.W;
      const t = ((px - s.pad.l) / (s.W - s.pad.l - s.pad.r)) * s.tMax;
      const near = samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
      const cross = svg.querySelector("#chartCross");
      cross.setAttribute("x1", s.x(near.t)); cross.setAttribute("x2", s.x(near.t)); cross.classList.remove("hidden");
      tip.innerHTML = `<b class="num">${fmtTime(near.t)}</b><span><i class="lg-dot" style="background:${WATER}"></i>الماء ${Math.round(near.w)}g</span>${near.c != null ? `<span><i class="lg-dot" style="background:${COFFEE}"></i>القهوة ${Math.round(near.c)}g</span>` : ""}`;
      tip.style.left = `${Math.min(rect.width - 130, Math.max(0, (s.x(near.t) / s.W) * rect.width - 65))}px`;
      tip.classList.remove("hidden");
    };
    const hide = () => { tip.classList.add("hidden"); svg.querySelector("#chartCross")?.classList.add("hidden"); };
    svg.addEventListener("pointermove", (e) => show(e.clientX));
    svg.addEventListener("pointerdown", (e) => show(e.clientX));
    svg.addEventListener("pointerleave", hide);
    window.addEventListener("resize", () => { if (!$("#brewLive").classList.contains("hidden")) drawChart(); });
  }

  // ════════════════ roasters' library ════════════════
  let LIB = [];
  let libLimit = 30;
  const normAr = (t) => String(t || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, "");

  fetch("reference-recipes.json").then((r) => r.json()).then((list) => {
    LIB = list.map((r, i) => ({ ...r, _i: i, _q: normAr(`${r.name} ${r.roaster} ${r.author}`) }));
    XBRecipe.setReference(list);
    $("#libCount").textContent = LIB.length;
    const counts = {};
    LIB.forEach((r) => { counts[r.roaster] = (counts[r.roaster] || 0) + 1; });
    $("#libRoaster").innerHTML = `<option value="">كل المحامص</option>` + Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${n})</option>`).join("");
    if ($("#panel-library").classList.contains("active")) renderLibrary();
  }).catch(() => { $("#libList").innerHTML = `<p class="muted small home-empty">تعذّر تحميل مكتبة المحامص.</p>`; });

  function libFiltered() {
    const q = normAr($("#libSearch").value.trim());
    const serve = $(`[data-lib="serve"] .opt-btn.active`)?.dataset.v || "all";
    const roaster = $("#libRoaster").value;
    const approved = $("#libApproved").checked;
    return LIB.filter((r) => (serve === "all" || r.serve === serve)
      && (!roaster || r.roaster === roaster)
      && (!approved || r.approved)
      && (!q || q.split(/\s+/).every((w) => r._q.includes(w))));
  }

  function libRow(r) {
    const meta = [r.serve === "iced" ? "بارد" : "حار", `${r.dose}g بن`, `${r.water}ml ماء`, r.ice ? `${r.ice}g ثلج` : null, r.grind != null ? `طحن ${r.grind}` : null].filter(Boolean).join("، ");
    return `<div class="hrow" data-lib-i="${r._i}" role="button" tabindex="0">
      <span class="hrow-dot" style="background:${escapeHtml(r.color || (r.serve === "iced" ? "#9FC5E8" : "#B08968"))}"></span>
      <span class="hrow-txt"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.roaster)}${r.approved ? ' <em class="approved">معتمدة</em>' : ""}</small><small>${meta}</small></span>
      <button class="hrow-brew" data-act="brew" type="button" aria-label="شغّل الآن على الجهاز"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10-6.5z"/></svg></button>
    </div>`;
  }

  function renderLibrary() {
    if (!LIB.length) { $("#libList").innerHTML = `<p class="muted small home-empty">جاري تحميل المكتبة…</p>`; return; }
    const rows = libFiltered();
    $("#libList").innerHTML = rows.length
      ? rows.slice(0, libLimit).map(libRow).join("")
      : `<p class="muted small home-empty">ما لقيت وصفات بهذا البحث. جرّب اسم المحصول أو المحمصة.</p>`;
    $("#libMore").classList.toggle("hidden", rows.length <= libLimit);
    $("#libMore").textContent = `عرض المزيد (${rows.length - Math.min(libLimit, rows.length)})`;
  }
  window.renderLibrary = renderLibrary;

  const resetAndRender = () => { libLimit = 30; renderLibrary(); };
  $("#libSearch").addEventListener("input", resetAndRender);
  $("#libRoaster").addEventListener("change", resetAndRender);
  $("#libApproved").addEventListener("change", resetAndRender);
  $$(`[data-lib="serve"] .opt-btn`).forEach((b) => b.addEventListener("click", () => {
    $$(`[data-lib="serve"] .opt-btn`).forEach((x) => x.classList.toggle("active", x === b));
    resetAndRender();
  }));
  $("#libMore").addEventListener("click", () => { libLimit += 30; renderLibrary(); });

  function showRecipeResult(spec, source) {
    state.preview = spec;
    showPanel("assistant");
    showAiState("aiStateResult");
    $("#resultErrBox")?.classList.add("hidden");
    $("#resultName").textContent = spec.name;
    $("#resultNotes").textContent = spec.notes || "";
    $("#resultSource").textContent = source;
    renderPreview(spec);
    $("#previewBadge").classList.remove("hidden");
    $("#previewActions").classList.add("hidden");
    window.scrollTo(0, 0);
  }

  $("#libList").addEventListener("click", (e) => {
    const row = e.target.closest("[data-lib-i]");
    if (!row) return;
    const ref = LIB[Number(row.dataset.libI)];
    const spec = XBRecipe.fromRef(ref);
    if (e.target.closest("[data-act='brew']")) { state.preview = spec; brewOnMachine(spec); return; }
    showRecipeResult(spec, `من مكتبة المحامص: ${ref.roaster}`);
  });

  // ════════════════ camera: photograph the bag label ════════════════
  // Live camera inside the app; if the browser won't give one (no permission, no
  // camera, iOS in-app browsers) fall back to the phone's own camera via capture=.
  let camStream = null, camFrom = null;
  const camView = $("#cameraView"), camVideo = $("#camVideo");

  function stopCamera() {
    camStream?.getTracks().forEach((t) => t.stop());
    camStream = null;
    camVideo.srcObject = null;
    camView.classList.add("hidden");
    document.body.classList.remove("cam-open");
  }

  // Image chosen → attach it; from the home box, design straight away.
  function useImage(dataUrl) {
    setAiImage(dataUrl);
    stopCamera();
    if (camFrom === "home") designFromHome($("#homeAiInput").value.trim());
    else toast("تم التصوير ✓ اضغط «صمّم الوصفة»");
  }

  async function openCamera(from) {
    camFrom = from;
    const canLive = !!(navigator.mediaDevices?.getUserMedia && window.isSecureContext);
    if (!canLive) { $("#camCapture").click(); return; }
    $("#camHint").textContent = "وجّه الكاميرا على ملصق الكيس";
    camView.classList.remove("hidden");
    document.body.classList.add("cam-open");
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      camVideo.srcObject = camStream;
      await camVideo.play().catch(() => {});
    } catch (err) {
      stopCamera();
      if (err?.name === "NotAllowedError") toast("اسمح للتطبيق باستخدام الكاميرا من إعدادات المتصفح، أو اختر صورة", "bad");
      $("#camCapture").click();
    }
  }

  function snap() {
    if (!camStream || !camVideo.videoWidth) return;
    const max = 1280;
    const k = Math.min(1, max / Math.max(camVideo.videoWidth, camVideo.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(camVideo.videoWidth * k);
    canvas.height = Math.round(camVideo.videoHeight * k);
    canvas.getContext("2d").drawImage(camVideo, 0, 0, canvas.width, canvas.height);
    camView.classList.add("flash");
    setTimeout(() => camView.classList.remove("flash"), 180);
    useImage(canvas.toDataURL("image/jpeg", 0.85));
  }

  async function fromFile(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("اختر صورة", "bad"); return; }
    try { useImage(await downscaleImage(await fileToDataURL(file))); }
    catch { toast("تعذّر قراءة الصورة", "bad"); }
  }

  $$("[data-camera]").forEach((b) => b.addEventListener("click", () => openCamera(b.dataset.camera)));
  $("#camSnap").addEventListener("click", snap);
  $("#camClose").addEventListener("click", stopCamera);
  $("#camGallery").addEventListener("change", (e) => fromFile(e.target));
  $("#camCapture").addEventListener("change", (e) => fromFile(e.target));
  document.addEventListener("visibilitychange", () => { if (document.hidden && camStream) stopCamera(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && camStream) stopCamera(); });

  // ════════════════ installable app ════════════════
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
