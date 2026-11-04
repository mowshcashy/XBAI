// Built-in recipe designer — works with no AI key.
// Reads an Arabic/English request ("سوّ لي قهوة باردة إثيوبية قوية") and builds an
// XBloom Studio recipe within the machine's limits. Iced coffee uses the Japanese
// method: a concentrated hot brew poured straight onto a measured amount of ice.
(function () {
  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  function norm(text) {
    return String(text || "")
      .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
      .toLowerCase()
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[ً-ْـ]/g, "");
  }
  const kw = (...words) => words.map(norm);
  const has = (t, words) => words.some((w) => t.includes(w));

  const W = {
    iced: kw("بارد", "بارده", "مثلج", "مثلجه", "ثلج", "ايس", "آيس", "iced", "ice", "cold", "مبرد"),
    hot: kw("حار", "حاره", "ساخن", "ساخنه", "hot", "دافي"),
    coldBrew: kw("كولد برو", "cold brew", "coldbrew"),
    tea: kw("شاي", "tea", "اولونج", "oolong", "بابونج", "chamomile", "اعشاب", "herbal", "نعناع", "earl grey", "ايرل", "سنشا", "sencha", "جاسمين", "jasmine", "زهورات", "كركديه", "hibiscus"),
    teaGreen: kw("اخضر", "green", "سنشا", "sencha", "جاسمين", "jasmine"),
    teaWhite: kw("ابيض", "white"),
    teaOolong: kw("اولونج", "oolong"),
    teaHerbal: kw("بابونج", "chamomile", "اعشاب", "herbal", "نعناع", "mint", "زهورات", "كركديه", "hibiscus"),
    lightRoast: kw("فاتح", "فاتحه", "تحميص خفيف", "خفيف التحميص", "light roast", "light", "blonde", "نوردك", "nordic"),
    mediumDark: kw("متوسط غامق", "متوسط الغامق", "medium dark", "medium-dark"),
    darkRoast: kw("غامق", "غامقه", "داكن", "داكنه", "تحميص قوي", "dark", "french", "italian"),
    mediumRoast: kw("متوسط", "متوسطه", "وسط", "medium"),
    strong: kw("قوي", "قويه", "مركز", "مركزه", "ثقيل", "ثقيله", "strong", "bold"),
    weak: kw("خفيف", "خفيفه", "لايت", "weak", "mild"),
    washed: kw("مغسول", "مغسوله", "washed"),
    natural: kw("طبيعي", "طبيعيه", "مجفف", "natural", "dry process"),
    honey: kw("عسل", "عسلي", "honey"),
    anaerobic: kw("لاهوائي", "لا هوائي", "انيروبك", "anaerobic", "تخمير", "fermented"),
    fresh: kw("طازج", "طازه", "fresh", "جديد التحميص", "محمص اليوم", "محمص جديد"),
    fruity: kw("فواكه", "فاكهه", "توت", "حمضي", "حمضيات", "زهري", "ورد", "fruity", "floral", "berry", "citrus", "bright"),
    chocolaty: kw("شوكولاته", "شوكولا", "كاكاو", "مكسرات", "كراميل", "chocolate", "cocoa", "nutty", "caramel"),
    twoCups: kw("كوبين", "2 كوب", "2 اكواب", "شخصين", "لشخصين", "two cups", "2 cups", "for two"),
    bigCup: kw("كوب كبير", "مق كبير", "mug", "large cup", "حجم كبير"),
  };

  const ORIGINS = [
    { id: "ethiopia", label: "إثيوبي", words: kw("اثيوبي", "اثيوبيا", "ethiopia", "ethiopian", "يرغاتشيفي", "يرقاتشيفي", "yirgacheffe", "سيدامو", "sidamo", "guji", "قوجي", "جوجي"), roast: "light", process: "washed", flavor: "زهرية وحمضية" },
    { id: "kenya", label: "كيني", words: kw("كيني", "كينيا", "kenya"), roast: "light", process: "washed", flavor: "توت وحمضية واضحة" },
    { id: "panama", label: "جيشا", words: kw("جيشا", "قيشا", "geisha", "gesha", "بنما", "panama"), roast: "light", process: "washed", flavor: "ياسمين وبرغموت" },
    { id: "rwanda", label: "رواندي", words: kw("رواندا", "رواندي", "rwanda"), roast: "light", process: "washed", flavor: "فواكه حمراء" },
    { id: "colombia", label: "كولومبي", words: kw("كولومبي", "كولومبيا", "colombia", "colombian"), roast: "medium", process: "washed", flavor: "كراميل وتفاح" },
    { id: "guatemala", label: "غواتيمالي", words: kw("غواتيمالا", "جواتيمالا", "guatemala"), roast: "medium", process: "washed", flavor: "شوكولاتة وحمضية لطيفة" },
    { id: "costarica", label: "كوستاريكي", words: kw("كوستاريكا", "costa rica"), roast: "medium", process: "honey", flavor: "عسل وحلاوة" },
    { id: "elsalvador", label: "سلفادوري", words: kw("السلفادور", "سلفادور", "el salvador"), roast: "medium", process: "washed", flavor: "حلو ومتوازن" },
    { id: "honduras", label: "هندوراسي", words: kw("هندوراس", "honduras"), roast: "medium", process: "washed", flavor: "كراميل" },
    { id: "peru", label: "بيروفي", words: kw("بيرو", "peru"), roast: "medium", process: "washed", flavor: "مكسرات وحلاوة" },
    { id: "yemen", label: "يمني", words: kw("يمني", "اليمن", "يمن", "yemen", "حرازي", "haraz", "mocha", "موكا"), roast: "medium", process: "natural", flavor: "فواكه مجففة وتوابل" },
    { id: "saudi", label: "خولاني", words: kw("خولاني", "khawlani", "جازان", "سعودي", "saudi"), roast: "medium", process: "natural", flavor: "فواكه مجففة وعسل" },
    { id: "brazil", label: "برازيلي", words: kw("برازيلي", "البرازيل", "برازيل", "brazil", "brazilian"), roast: "medium_dark", process: "natural", flavor: "شوكولاتة ومكسرات" },
    { id: "sumatra", label: "سومطري", words: kw("سومطرا", "sumatra", "اندونيسيا", "indonesia", "مانديلينج", "mandheling"), roast: "dark", process: "natural", flavor: "ترابية وتوابل" },
  ];

  const ROASTS = {
    // Calibrated on 487 Saudi roasters' XBloom recipes: hot median grind 55, 100 rpm,
    // ratio 1:15, 91°C, bloom ≈ 2.3× dose with a 20-30 s pause, 4 pours.
    light:       { label: "فاتح",        temp: 93, grind: 52, ratio: 15.5, rpm: 110, bloomX: 2.5, bloomPause: 30, mains: 3, pattern: "spiral",   pauses: [20, 15, 0], color: "#D4BFA0" },
    medium:      { label: "متوسط",       temp: 91, grind: 56, ratio: 15,   rpm: 100, bloomX: 2.3, bloomPause: 25, mains: 3, pattern: "circular", pauses: [15, 15, 0], color: "#B08968" },
    medium_dark: { label: "متوسط غامق",  temp: 90, grind: 60, ratio: 15,   rpm: 90,  bloomX: 2.2, bloomPause: 20, mains: 2, pattern: "circular", pauses: [15, 0],     color: "#8B5E3C" },
    dark:        { label: "غامق",        temp: 88, grind: 64, ratio: 15.5, rpm: 80,  bloomX: 2.0, bloomPause: 20, mains: 2, pattern: "circular", pauses: [10, 0],     color: "#6F4E37" },
  };
  const PROCESS_LABEL = { washed: "مغسول", natural: "طبيعي", honey: "عسلي", anaerobic: "لاهوائي" };

  const TEAS = {
    green:  { label: "أخضر",  temp: 75,  steeps: [60, 45, 75],    dose: 4, color: "#A8C686" },
    white:  { label: "أبيض",  temp: 80,  steeps: [90, 60, 90],    dose: 5, color: "#E3D9C2" },
    oolong: { label: "أولونج", temp: 92, steeps: [50, 60, 90],    dose: 5, color: "#C9A15B" },
    black:  { label: "أحمر",  temp: 95,  steeps: [120, 150, 180], dose: 4, color: "#8B4A2B" },
    herbal: { label: "أعشاب", temp: 100, steeps: [240, 300],      dose: 4, color: "#D98BA0" },
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round = (v, step = 1) => Math.round(v / step) * step;

  function parse(text, overrides = {}) {
    const t = norm(text);
    const intent = {
      kind: has(t, W.tea) ? "tea" : "coffee",
      serve: "hot",
      roast: null, process: null, origin: null,
      strength: "balanced", cups: 1, fresh: has(t, W.fresh),
      coldBrewAsked: has(t, W.coldBrew),
      dose: null, ratio: null, totalMl: null, altitude: null, teaType: "black",
    };

    if (has(t, W.iced) || intent.coldBrewAsked) intent.serve = "iced";
    if (has(t, W.hot) && !has(t, W.iced)) intent.serve = "hot";

    intent.origin = ORIGINS.find((o) => has(t, o.words)) || null;

    if (has(t, W.mediumDark)) intent.roast = "medium_dark";
    else if (has(t, W.lightRoast)) intent.roast = "light";
    else if (has(t, W.darkRoast)) intent.roast = "dark";
    else if (has(t, W.mediumRoast)) intent.roast = "medium";

    if (has(t, W.anaerobic)) intent.process = "anaerobic";
    else if (has(t, W.honey)) intent.process = "honey";
    else if (has(t, W.natural)) intent.process = "natural";
    else if (has(t, W.washed)) intent.process = "washed";

    const tWithoutRoastWords = t.replace(norm("خفيف التحميص"), "").replace(norm("تحميص خفيف"), "");
    if (has(t, W.strong)) intent.strength = "strong";
    else if (has(tWithoutRoastWords, W.weak)) intent.strength = "weak";

    if (has(t, W.twoCups)) intent.cups = 2;
    else if (has(t, W.bigCup)) intent.cups = 1.5;

    const dose = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:grams|gram|gr|g|جرام|غرام|قرام|جم|ج)(?![a-z])/);
    if (dose) intent.dose = Number(dose[1]);
    const ratio = t.match(/1\s*[:/]\s*(\d{1,2}(?:\.\d)?)/);
    if (ratio) intent.ratio = Number(ratio[1]);
    const ml = t.match(/(\d{3})\s*(?:ml|مل|ملي)/);
    if (ml) intent.totalMl = Number(ml[1]);
    // Growing altitude: "1600", "1600م", "2000 متر", "1,900 masl" — not grams/ml/ratios.
    const altRe = /(?:^|[^\d.:/])(\d{1},?\d{3}|\d{3})\s*(m|م|متر|masl|meters?)?(?![\d.]|\s*(?:ml|مل|g|gr|gram|جرام|غرام|قرام|جم|ج(?![؀-ۿ])))/g;
    for (const m of t.matchAll(altRe)) {
      const v = Number(m[1].replace(",", ""));
      if (v >= 800 && v <= 2600 && (m[2] || v >= 1000 || /ارتفاع|altitude/.test(t))) { intent.altitude = v; break; }
    }

    if (intent.kind === "tea") {
      if (has(t, W.teaHerbal)) intent.teaType = "herbal";
      else if (has(t, W.teaOolong)) intent.teaType = "oolong";
      else if (has(t, W.teaGreen)) intent.teaType = "green";
      else if (has(t, W.teaWhite)) intent.teaType = "white";
    }

    // No roast given: use origin's typical roast, then flavour words, then medium.
    if (!intent.roast) {
      if (intent.origin) intent.roast = intent.origin.roast;
      else if (has(t, W.fruity)) intent.roast = "light";
      else if (has(t, W.chocolaty)) intent.roast = "medium_dark";
      else intent.roast = "medium";
    }
    if (!intent.process && intent.origin) intent.process = intent.origin.process;

    intent.mentioned = {
      serve: has(t, W.iced) || has(t, W.hot) || intent.coldBrewAsked,
      strength: intent.strength !== "balanced",
      cups: intent.cups !== 1,
      process: has(t, [...W.anaerobic, ...W.honey, ...W.natural, ...W.washed]),
    };
    Object.assign(intent, Object.fromEntries(Object.entries(overrides).filter(([, v]) => v != null)));
    return intent;
  }

  function splitWater(total, weights) {
    const out = weights.map((w) => Math.round(total * w));
    out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
    return out;
  }

  // ---------- what the roasters' library teaches ----------
  // Every coffee recipe in the library becomes a row; a request is answered by the
  // recipes with the closest dose (kernel-weighted medians), then nudged for roast,
  // process and altitude by bounded, proportional rules.
  let MODEL = null;
  const brewSeconds = (pours) => pours.reduce((s, p, k) => {
    const v = Number(p.volume_ml ?? p.v) || 0;
    const f = Number(p.flow_rate ?? p.flow) || 3;
    const pause = Number(p.pause_seconds ?? p.p) || 0;
    return s + v / f + (k < pours.length - 1 ? pause : 0);
  }, 0);
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

  function buildModel(list) {
    const rows = list.filter((r) => !r.tea && r.dose && r.pours?.length >= 2 && r.grind).map((r) => {
      const water = r.pours.reduce((a, p) => a + p.v, 0);
      const mids = r.pours.slice(1, -1).map((p) => p.p);
      return {
        serve: r.serve, dose: r.dose, approved: !!r.approved,
        grind: r.grind, rpm: r.rpm || null, temp: r.pours[0].t,
        ratio: water / r.dose, iceK: r.ice ? r.ice / r.dose : null,
        bloomX: r.pours[0].v / r.dose, bloomPause: r.pours[0].p,
        midPause: mids.length ? median(mids) : null,
        n: r.pours.length, time: brewSeconds(r.pours),
      };
    }).filter((r) => r.ratio >= 6 && r.ratio <= 20 && r.time > 40 && r.time < 400);
    MODEL = rows.length >= 30 ? rows : null;
  }

  function wq(pairs, q) {
    const s = pairs.filter(([v]) => v != null && Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
    if (!s.length) return null;
    const tot = s.reduce((a, [, w]) => a + w, 0);
    let acc = 0;
    for (const [v, w] of s) { acc += w; if (acc >= tot * q) return v; }
    return s[s.length - 1][0];
  }

  // Weighted picture of the library around one dose.
  function predict(serve, dose) {
    if (!MODEL) return null;
    const rows = MODEL.filter((r) => r.serve === serve);
    if (rows.length < 10) return null;
    const w = rows.map((r) => Math.exp(-(((r.dose - dose) / 2.5) ** 2)) * (r.approved ? 1.5 : 1));
    const f = (key, q = 0.5) => wq(rows.map((r, k) => [r[key], w[k]]), q);
    return {
      count: w.filter((x) => x > 0.35).length,
      grind: f("grind"), rpm: f("rpm"), temp: f("temp"), ratio: f("ratio"), iceK: f("iceK"),
      bloomX: f("bloomX"), bloomPause: f("bloomPause"), midPause: f("midPause"), n: f("n"),
      time: f("time"), t10: f("time", 0.1), t75: f("time", 0.75), t90: f("time", 0.9),
    };
  }

  // Proportional adjustments on top of the library median (which sits at a light-medium
  // roast, ~1500 m, mixed processes). Each returns the deltas plus the reason shown to the user.
  const ROAST_DELTA = {
    light:       { grind: -2, temp: 1.5, rpm: 5, why: "تحميص فاتح: حبة أقسى وأقل ذوبان → طحن أنعم بدرجتين وحرارة أعلى" },
    medium:      { grind: 0, temp: 0, rpm: 0, why: null },
    medium_dark: { grind: 3, temp: -1.5, rpm: -10, why: "متوسط غامق: يذوب أسرع → طحن أخشن وحرارة أقل عشان ما تطلع مرارة" },
    dark:        { grind: 6, temp: -3, rpm: -15, why: "تحميص غامق: يستخلص بسرعة → طحن أخشن واضح وحرارة أقل" },
  };
  const PROCESS_DELTA = {
    washed:    { grind: -1, temp: 0.5, ratio: 0, pause: 0, why: "مغسول: نظيف وكثيف → أنعم شوي يبرز الحموضة والوضوح" },
    natural:   { grind: 1.5, temp: -0.5, ratio: -0.3, pause: 0, why: "طبيعي: سكريات وفواكه عالية ويستخلص أسرع → أخشن شوي وحرارة أقل" },
    honey:     { grind: 1, temp: -0.5, ratio: -0.2, pause: 0, why: "عسلي: حلاوة وقوام → أخشن شوي" },
    anaerobic: { grind: 3, temp: -1.5, ratio: 0.5, pause: 5, why: "لاهوائي: التخمير يخلي الحبة تستخلص بسرعة وتطلع حدّة → طحن أخشن بثلاث درجات، حرارة أقل، ماء أكثر شوي وبلوم أطول للغازات" },
  };
  // Denser high-grown beans need finer and hotter; low-grown the opposite. Linear around 1500 m.
  function altitudeDelta(alt) {
    if (!alt) return null;
    const steps = (alt - 1500) / 100;
    const grind = clamp(-0.6 * steps, -4, 4);
    const temp = clamp(0.3 * steps, -2, 2);
    let why;
    if (Math.abs(steps) < 2) why = `ارتفاع ${alt}م متوسط → تعديل بسيط (طحن ${grind >= 0 ? "+" : ""}${grind.toFixed(1)}، حرارة ${temp >= 0 ? "+" : ""}${temp.toFixed(1)}°)`;
    else if (steps > 0) why = `ارتفاع ${alt}م عالي: حبة كثيفة → طحن أنعم ${Math.abs(grind).toFixed(1)} وحرارة +${temp.toFixed(1)}°`;
    else why = `ارتفاع ${alt}م منخفض: حبة أقل كثافة → طحن أخشن ${grind.toFixed(1)} وحرارة ${temp.toFixed(1)}°`;
    return { grind, temp, why };
  }

  // Keep the brew inside the library's time band for this dose: trim or add pauses
  // (mid pauses first, then the bloom), never the water.
  function fitTiming(pours, band) {
    if (!band || pours.length < 2) return null;
    const before = Math.round(brewSeconds(pours));
    const last = pours.length - 1;
    const mids = () => pours.slice(1, last);
    let t = brewSeconds(pours);
    if (t > band.hi) {
      let over = t - band.hi;
      // An over-long bloom goes first (roasters rarely wait past ~35 s), then all waits shrink together.
      const bloomCut = Math.min(over, Math.max(0, pours[0].pause_seconds - band.maxBloom));
      pours[0].pause_seconds -= bloomCut; over -= bloomCut;
      const slack = [...mids().map((p) => Math.max(0, p.pause_seconds - 5)), Math.max(0, pours[0].pause_seconds - band.minBloom)];
      const room = slack.reduce((a, b) => a + b, 0);
      if (over > 0 && room > 0) {
        const k = Math.min(1, over / room);
        mids().forEach((p, j) => { p.pause_seconds -= slack[j] * k; });
        pours[0].pause_seconds -= slack[slack.length - 1] * k;
      }
    } else if (t < band.lo && mids().length) {
      let under = band.lo - t;
      for (const p of mids()) { const add = Math.min(under, Math.max(0, 25 - p.pause_seconds)); p.pause_seconds += add; under -= add; }
    }
    pours.forEach((p) => { p.pause_seconds = Math.round(p.pause_seconds); });
    const after = Math.round(brewSeconds(pours));
    return after !== before ? { before, after } : null;
  }
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  function timeBand(serve, dose, fresh) {
    const P = predict(serve, dose);
    const iced = serve === "iced";
    const lo = P?.t10 ?? (iced ? 75 : 90);
    const hi = (P?.t75 ?? (iced ? 125 : 140)) + (fresh ? 10 : 0);
    return { lo, hi, typical: P?.time ?? (iced ? 113 : 126), minBloom: iced ? 20 : 15, maxBloom: fresh ? 45 : 35 };
  }

  function buildCoffee(i) {
    const R = ROASTS[i.roast] || ROASTS.medium;
    const iced = i.serve === "iced";
    const why = [];

    const perCup = iced ? 17 : 15;
    let dose = i.dose || (i.cups >= 2 ? (iced ? 25 : 24) : i.cups > 1 ? (iced ? 22 : 20) : perCup);
    dose = clamp(round(dose), 8, 31);

    const P = predict(i.serve, dose);
    let grind, temp, ratio, rpm, bloomX, bloomPause, midPause, nPours, iceK;
    if (P) {
      grind = P.grind; temp = P.temp; ratio = P.ratio; rpm = P.rpm || 100;
      bloomX = clamp(P.bloomX, 1.8, 3); bloomPause = clamp(P.bloomPause, 15, 40);
      midPause = clamp(P.midPause ?? 15, 5, 25); nPours = clamp(Math.round(P.n), 2, 5);
      iceK = clamp(P.iceK ?? 6.7, 5, 8);
      why.push(`بنيتها على ${P.count} وصفة محامص بجرعة قريبة من ${dose}g (متوسطهم: طحن ${Math.round(P.grind)}، حرارة ${Math.round(P.temp)}°، وقت ${mmss(P.time)})`);
    } else {
      grind = R.grind + (iced ? -5 : 0); temp = R.temp + (iced ? 1 : 0);
      ratio = iced ? 10 : R.ratio; rpm = R.rpm - (iced ? 15 : 0);
      bloomX = iced ? Math.min(R.bloomX, 2.3) : R.bloomX; bloomPause = iced ? 30 : R.bloomPause;
      midPause = 15; nPours = iced ? 3 : R.mains + 1; iceK = 6.5;
    }

    // Library median ≈ light-medium; shift for the roast asked.
    const rd = ROAST_DELTA[i.roast] || ROAST_DELTA.medium;
    if (P) { grind += rd.grind; temp += rd.temp; rpm += rd.rpm; if (rd.why) why.push(rd.why); }

    const pd = PROCESS_DELTA[i.process];
    if (pd) { grind += pd.grind; temp += pd.temp; ratio += pd.ratio; bloomPause += pd.pause; if (i.mentioned?.process || i.process === "anaerobic") why.push(pd.why); }

    const ad = altitudeDelta(i.altitude);
    if (ad) { grind += ad.grind; temp += ad.temp; why.push(ad.why); }

    if (i.strength === "strong") ratio -= 1;
    if (i.strength === "weak") ratio += 1;
    if (i.fresh) { bloomX += 0.3; bloomPause += 10; why.push("محمّص طازج: بلوم أكبر وانتظار أطول يطلع الغازات"); }
    if (i.ratio && !iced) ratio = i.ratio;

    // Big-dose roaster recipes lean on 1:12-13; a person asking for two cups still wants a full 1:15-ish cup.
    if (!iced && !i.ratio) ratio = clamp(ratio, 14.5, 16.5);
    ratio = iced ? clamp(ratio, 8, 13) : clamp(ratio, 12, 18);
    let hotWater, ice = 0, total;
    if (iced) {
      if (i.totalMl) { total = i.totalMl; hotWater = Math.round(total * 0.6); ice = round(total - hotWater, 5); }
      else { hotWater = Math.round(dose * ratio); ice = round(dose * iceK, 5); total = hotWater + ice; }
    } else {
      hotWater = Math.round(i.totalMl ? clamp(i.totalMl, dose * 12, dose * 18) : dose * ratio);
      total = hotWater;
    }

    grind = clamp(Math.round(grind), iced ? 30 : 35, iced ? 70 : 78);
    temp = clamp(Math.round(temp), 82, 95);
    rpm = clamp(Math.round(rpm / 5) * 5, 60, 120);

    const bloom = Math.round(dose * bloomX);
    let mains = Math.max(iced ? 2 : 2, nPours - 1);
    const rest = hotWater - bloom;
    while (rest / mains > (iced ? 110 : 130) && mains < 5) mains++;
    const weights = mains === 2 ? [0.55, 0.45] : mains === 3 ? [0.38, 0.33, 0.29] : Array(mains).fill(1 / mains);
    const mainVols = splitWater(rest, weights);
    const darkish = i.roast === "dark" || i.roast === "medium_dark";

    const pours = [{
      name: "Bloom", volume_ml: bloom, temperature_c: temp, pattern: "spiral",
      flow_rate: 3.0, pause_seconds: Math.round(bloomPause), agitate_before: false, agitate_after: i.roast !== "dark",
    }, ...mainVols.map((v, k) => ({
      name: `Pour ${k + 2}`, volume_ml: v,
      temperature_c: darkish ? temp - k : temp,
      pattern: k === mainVols.length - 1 && !iced && i.roast !== "light" ? "centered" : R.pattern,
      flow_rate: 3.2, pause_seconds: k === mainVols.length - 1 ? 0 : Math.round(midPause), agitate_before: false, agitate_after: false,
    }))];

    const band = timeBand(i.serve, dose, i.fresh);
    const fit = fitTiming(pours, band);
    const secs = Math.round(brewSeconds(pours));
    if (fit && fit.before > fit.after) why.push(`قصّرت الانتظار عشان الوقت ما يسحب (${mmss(fit.before)} → ${mmss(fit.after)})`);

    const originLabel = i.origin ? i.origin.label : "";
    const procLabel = i.process && (i.mentioned?.process || i.process === "anaerobic") ? ` ${PROCESS_LABEL[i.process]}` : "";
    const nameCore = originLabel ? `${originLabel} ${R.label}${procLabel}` : `تحميص ${R.label}${procLabel}`;
    const name = iced
      ? `آيس ${nameCore} (ثلج ${ice}g)`
      : `${originLabel ? nameCore : `قهوة ${nameCore}`}${i.altitude ? ` ${i.altitude}م` : ""}${i.cups >= 2 ? " لكوبين" : ""}`;
    const machineRatio = Number((hotWater / dose).toFixed(1));

    let notes = `${dose}g بن مع ${hotWater}ml ماء${iced ? " حار" : ` (1:${machineRatio})`}، حرارة ${temp}°، طحن ${grind}، بلوم ${bloom}ml ثم ${mainVols.length} صبات — الوقت المتوقع ${mmss(secs)}.`;
    if (iced) notes += ` قبل التشغيل حط ${ice}g ثلج في الكوب — الماء الحار يذوب الثلج ويطلع لك ${total}ml قهوة باردة.`;
    if (why.length) notes += " " + why.join(". ") + ".";
    if (i.coldBrewAsked) notes += " ملاحظة: الكولد برو يحتاج نقع ساعات وما يسويه الجهاز، فسويت لك آيس بالطريقة اليابانية بنفس الروح.";
    if (i.strength === "strong") notes += " خليتها أقوى بماء أقل.";
    if (i.strength === "weak") notes += " خليتها أخف بماء أكثر.";

    return {
      kind: "coffee", name: name.slice(0, 60), notes,
      dose_g: dose, ratio: machineRatio, grind_size: grind, grind_rpm: rpm,
      color: iced ? "#9FC5E8" : R.color,
      roast: i.roast === "medium_dark" ? "dark" : i.roast, process: i.process || undefined,
      serve: i.serve, ice_g: ice || undefined, total_ml: total, brew_seconds: secs,
      pours,
    };
  }

  function buildTea(i) {
    const T = TEAS[i.teaType] || TEAS.black;
    const iced = i.serve === "iced";
    let dose = i.dose || T.dose + (i.cups >= 2 ? 2 : i.cups > 1 ? 1 : 0);
    if (iced) dose = Math.round(dose * 1.6);
    dose = clamp(dose, 1, 10);
    const factor = i.strength === "strong" ? 1.25 : i.strength === "weak" ? 0.8 : 1;
    const times = iced ? T.steeps.slice(0, 2) : T.steeps;
    const vol = iced ? 70 : i.cups >= 2 ? 90 : 80;
    const steeps = times.map((s, k) => ({
      volume_ml: vol,
      temperature_c: clamp(T.temp + k * 2, 65, 100),
      steep_seconds: clamp(Math.round(s * factor), 10, 360),
      flow_rate: 3.0,
    }));
    const water = steeps.reduce((a, s) => a + s.volume_ml, 0);
    const ice = iced ? round(water * 0.8, 5) : 0;
    let notes = `شاي ${T.label}: ${dose}g أوراق، حرارة ${T.temp}°، ${steeps.length} نقعات (${steeps.map((s) => s.steep_seconds + "ث").join(" / ")}).`;
    if (iced) notes += ` حط ${ice}g ثلج في الكوب قبل التشغيل — النقع مركّز عشان يتوازن مع الثلج.`;
    return {
      kind: "tea", name: `شاي ${T.label}${iced ? ` بارد (ثلج ${ice}g)` : ""}`.slice(0, 60), notes,
      dose_g: dose, ratio: Number((water / dose).toFixed(1)), color: T.color,
      serve: i.serve, ice_g: ice || undefined, total_ml: water + ice,
      steeps,
    };
  }

  function build(intent) {
    return intent.kind === "tea" ? buildTea(intent) : buildCoffee(intent);
  }

  function design(text, overrides) {
    return build(parse(text, overrides));
  }

  // English summary of the parsed request, handed to the AI so it honours hot/iced etc.
  function hint(i) {
    const bits = [
      i.kind === "tea" ? `${i.teaType} tea` : "pour-over coffee",
      i.serve === "iced" ? "ICED (Japanese method: brew hot onto ice; ice ≈ 40% of total liquid; grind ~6 finer; report ice_g)" : "HOT",
      i.kind === "coffee" ? `roast ${i.roast}` : null,
      i.process ? `process ${i.process}` : null,
      i.origin ? `origin ${i.origin.id}` : null,
      i.strength !== "balanced" ? `strength ${i.strength}` : null,
      i.cups !== 1 ? `${i.cups} cups` : null,
      i.altitude ? `grown at ${i.altitude} m (denser above 1500 m: slightly finer/hotter; below: coarser/cooler)` : null,
    ].filter(Boolean);
    return `Parsed request: ${bits.join(", ")}.`;
  }

  // Make an AI-produced recipe respect the request (iced conversion, machine limits, water balance).
  function finalize(recipe, intent) {
    if (!recipe) return recipe;
    const r = { ...recipe };
    if (r.kind === "tea" || !Array.isArray(r.pours) || !r.pours.length) return { ...r, serve: r.serve || intent?.serve || "hot" };
    r.dose_g = clamp(Number(r.dose_g) || 15, 1, 31);
    r.grind_size = clamp(Math.round(Number(r.grind_size) || 55), 1, 120);
    r.grind_rpm = clamp(Math.round(Number(r.grind_rpm) || 80), 60, 120);
    r.pours = r.pours.slice(0, 7).map((p) => ({ ...p, temperature_c: clamp(Math.round(Number(p.temperature_c) || 92), 40, 95) }));
    const sum = r.pours.reduce((a, p) => a + (Number(p.volume_ml) || 0), 0);

    // The hot/iced choice (buttons, synced with the text) wins over whatever the model decided.
    if (intent?.serve === "hot" && (r.ice_g || r.serve === "iced" || r.iced)) {
      delete r.ice_g; delete r.iced;
      r.serve = "hot";
      r.name = String(r.name || "").replace(/^(?:آيس|Iced)\s+/i, "").replace(/\s*(?:\(ثلج\s*\d+\s*g\)|·\s*ice\s*\d+\s*g)\s*/gi, " ").trim();
    }

    if (intent?.serve === "iced" && !r.ice_g) {
      const total = Math.round(r.dose_g * clamp(Number(r.ratio) || 15, 12, 18));
      const ice = round(total * 0.4, 5);
      const hot = total - ice;
      const bloom = r.pours.length === 1 ? hot : Math.min(Number(r.pours[0].volume_ml) || r.dose_g * 2, Math.round(hot * 0.3));
      const restSum = (sum - (Number(r.pours[0].volume_ml) || 0)) || 1;
      const k = (hot - bloom) / restSum;
      r.pours = r.pours.map((p, idx) => ({ ...p, volume_ml: idx === 0 ? bloom : Math.max(5, Math.round(p.volume_ml * k)) }));
      r.ice_g = ice;
      r.total_ml = total;
      r.grind_size = clamp(r.grind_size - 5, 1, 120);
      r.name = `آيس ${String(r.name || "").replace(/^آيس\s*/, "")} (ثلج ${ice}g)`.slice(0, 60);
      r.notes = `${r.notes || ""} قبل التشغيل حط ${ice}g ثلج في الكوب — الماء الحار يذوب الثلج ويطلع ${total}ml قهوة باردة.`.trim();
    }
    // Hold AI answers to the roasters' standard (bounds from the 487-recipe library):
    // iced hot water 8-14× dose with ice 5-8× dose; hot ratio 1:12-1:18.
    const iced = !!r.ice_g || intent?.serve === "iced";
    const total = () => r.pours.reduce((acc, p) => acc + (Number(p.volume_ml) || 0), 0);
    const rescale = (target) => {
      if (r.pours.length === 1) { r.pours[0] = { ...r.pours[0], volume_ml: target }; return; }
      const bloom = Math.min(Number(r.pours[0].volume_ml) || r.dose_g * 2, Math.round(target * 0.3));
      const rest = (total() - (Number(r.pours[0].volume_ml) || 0)) || 1;
      const k = (target - bloom) / rest;
      r.pours = r.pours.map((p, idx) => ({ ...p, volume_ml: idx === 0 ? bloom : Math.max(5, Math.round(p.volume_ml * k)) }));
    };
    const hotRatio = total() / r.dose_g;
    if (iced) {
      if (hotRatio < 8 || hotRatio > 14) rescale(Math.round(r.dose_g * 10));
      const iceK = (Number(r.ice_g) || 0) / r.dose_g;
      if (!r.ice_g || iceK < 5 || iceK > 8) r.ice_g = round(r.dose_g * 6.5, 5);
    } else if (hotRatio < 12 || hotRatio > 18) {
      rescale(Math.round(r.dose_g * 15));
    }

    if (r.ice_g) {
      let n = String(r.name || "آيس").replace(/\s*·\s*ice\s*\d+\s*g$/i, "");
      if (/[\u0600-\u06FF]/.test(n)) n = n.replace(/^Iced\s+/i, "آيس ");
      n = n.replace(/^(?:(?:آيس|Iced)\s+)+/i, (m) => m.trim().split(/\s+/)[0] + " ");
      if (/ثلج\s*\d+\s*g/.test(n)) n = n.replace(/ثلج\s*\d+\s*g/, `ثلج ${Math.round(r.ice_g)}g`);
      else {
        const suffix = ` (ثلج ${Math.round(r.ice_g)}g)`;
        n = n.slice(0, 60 - suffix.length) + suffix;
      }
      r.name = n;
    }
    // Keep the timing in the library's band for this dose (AI answers often drag).
    r.pours = r.pours.map((p) => ({ ...p, pause_seconds: clamp(Math.round(Number(p.pause_seconds) || 0), 0, 60) }));
    fitTiming(r.pours, timeBand(iced ? "iced" : "hot", r.dose_g, intent?.fresh));
    r.brew_seconds = Math.round(brewSeconds(r.pours));
    const water = total();
    r.ratio = Number((water / r.dose_g).toFixed(1));
    r.serve = r.ice_g ? "iced" : (r.serve || intent?.serve || "hot");
    r.total_ml = water + (Number(r.ice_g) || 0);

    // Models often describe different numbers than the pours they return. Lead with the
    // real numbers and keep only the AI's wording that carries no figures.
    const summary = [
      `${r.dose_g}g بن`,
      `${water}ml ماء${r.ice_g ? " حار" : ""}`,
      r.ice_g ? `${Math.round(r.ice_g)}g ثلج` : null,
      `حرارة ${r.pours[0].temperature_c}°`,
      `طحن ${r.grind_size}`,
      `${r.pours.length} صبات`,
      `الوقت ~${mmss(r.brew_seconds)}`,
    ].filter(Boolean).join("، ") + "." + (r.ice_g ? ` حط ${Math.round(r.ice_g)}g ثلج في الكوب قبل التشغيل.` : "");
    const prose = String(r.notes || "")
      .split(/(?<=[.!؟?\n])\s*/)
      .map((x) => x.replace(/^☕🧊\s*/, "").trim())
      .filter((x) => x && !/[0-9\u0660-\u0669]/.test(x));
    r.notes = [summary, ...prose].join(" ");
    return r;
  }

  // ---------- reference library: the roasters' own recipes ----------
  let REF = [];
  const STOP = new Set(kw(
    "وصفه", "جديده", "قهوه", "قهوتي", "بارد", "بارده", "حار", "حاره", "مثلج", "مثلجه", "ايس", "ثلج", "بن",
    "ابي", "ابغى", "ابغي", "ودي", "سو", "سوي", "سولي", "اعطني", "عطني", "لي", "من", "في", "مع", "على", "كوب", "كوبين",
    "قوي", "قويه", "خفيف", "خفيفه", "محمصه", "recipe", "iced", "ice", "hot", "cold", "new", "the", "coffee",
    "draft", "by", "for", "roastery", "roasters", "with", "بواسطه",
    "توازن", "حلاوه", "وضوح", "قوام",
    "فاتح", "فاتحه", "غامق", "غامقه", "داكن", "متوسط", "متوسطه", "وسط", "تحميص", "محمص", "كبير", "كبيره", "صغير",
    "لكوبين", "شخصين", "لشخصين", "طازج", "طازجه", "حلو", "حلوه", "زين", "زينه", "مزبوط", "عادي", "عاديه", "كويس",
    "لاهوائي", "لاهوائيه", "هوائي", "هوائيه", "طبيعي", "طبيعيه", "مغسول", "مغسوله", "عسلي", "عسليه",
    "natural", "washed", "honey", "anaerobic", "light", "dark", "medium", "roast", "fresh",
    "ارتفاع", "متر", "حبوب", "حبه", "mug",
  ));
  const DECAF = kw("ديكاف", "دي كاف", "decaf");
  const STYLE_WORDS = { [norm("توازن")]: "balance", [norm("حلاوة")]: "sweet", [norm("وضوح")]: "clarity", [norm("قوام")]: "body" };
  const styleOf = (text) => { const n = norm(text); return Object.keys(STYLE_WORDS).find((k) => n.includes(k)) || null; };
  const tokens = (text) => norm(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));

  function setReference(list) {
    buildModel(list || []);
    REF = (list || []).filter((r) => !r.tea && r.dose && r.pours?.length).map((r) => ({
      ...r,
      _tok: tokens(r.name),
      _rtok: tokens(r.roaster),
      _decaf: has(norm(r.name), DECAF),
      _origin: (ORIGINS.find((o) => has(norm(r.name), o.words)) || {}).id || null,
      _style: styleOf(r.name),
    }));
  }

  // Best roaster recipes for a request. `relevance` counts only real matches
  // (bean/farm/origin/roaster/style words), not the serve or approval bonus.
  function match(text, intent, limit = 3) {
    if (!REF.length || intent.kind !== "coffee") return [];
    const words = tokens(text);
    const style = styleOf(text);
    const wantsDecaf = has(norm(text), DECAF);
    const hits = (r) => words.filter((w) => r._tok.some((x) => x === w || (w.length >= 4 && x.length >= 4 && (x.startsWith(w) || w.startsWith(x))))).length;
    return REF
      .filter((r) => r.serve === intent.serve)
      .map((r) => {
        let relevance = hits(r) * 3 + words.filter((w) => r._rtok.includes(w)).length * 5;
        if (r._decaf && !wantsDecaf) relevance -= 4;
        if (intent.origin && r._origin === intent.origin.id) relevance += 3;
        if (style && r._style === style) relevance += 2;
        return { r, relevance, score: relevance + (r.approved ? 1 : 0) };
      })
      .filter((m) => m.relevance > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function fromReference(ref, i) {
    const iced = ref.serve === "iced";
    let dose = i.dose || (i.cups >= 2 ? Math.min(25, Math.round(ref.dose * 1.6)) : i.cups > 1 ? Math.round(ref.dose * 1.25) : ref.dose);
    dose = clamp(dose, 8, 31);
    const k = dose / ref.dose;
    const sk = i.strength === "strong" ? 0.9 : i.strength === "weak" ? 1.1 : 1;
    const pours = ref.pours.map((p, idx) => ({
      name: idx === 0 ? "Bloom" : `Pour ${idx + 1}`,
      volume_ml: Math.max(5, Math.round(p.v * k * (idx === 0 ? 1 : sk))),
      temperature_c: clamp(Math.round(p.t), 40, 95),
      pattern: p.pat || "circular",
      flow_rate: p.flow || 3,
      pause_seconds: p.p || 0,
      agitate_before: false,
      agitate_after: !!p.ag,
    }));
    let grind = Number(ref.grind ?? 55), temp0 = pours[0].temperature_c;
    const adj = [];
    if (k !== 1) {
      const a = predict(ref.serve, ref.dose), b = predict(ref.serve, dose);
      if (a && b) grind += b.grind - a.grind;
    }
    const refProc = ["anaerobic", "honey", "natural", "washed"].find((p) => has(norm(ref.name), W[p]));
    const pd = PROCESS_DELTA[i.process];
    if (pd && i.mentioned?.process && refProc !== i.process) { grind += pd.grind; temp0 += pd.temp; adj.push(pd.why); }
    const ad = altitudeDelta(i.altitude);
    if (ad && !norm(ref.name).includes(String(i.altitude))) { grind += ad.grind; temp0 += ad.temp; adj.push(ad.why); }
    const dt = Math.round(temp0) - pours[0].temperature_c;
    if (dt) pours.forEach((p) => { p.temperature_c = clamp(p.temperature_c + dt, 40, 95); });
    grind = clamp(Math.round(grind), 1, 120);
    const fit = fitTiming(pours, timeBand(ref.serve, dose, i.fresh));
    if (fit && fit.before > fit.after) adj.push(`قصّرت الانتظار (${mmss(fit.before)} → ${mmss(fit.after)})`);
    const water = pours.reduce((a, p) => a + p.volume_ml, 0);
    const ice = iced ? round((ref.ice || water * 0.65) * k, 5) : 0;
    let name = ref.name;
    if (iced && !/ثلج\s*\d+/.test(name)) name = `${name} (ثلج ${ice}g)`;
    if (i.cups >= 2) name = `${name} لكوبين`;
    let notes = `مبنية على وصفة «${ref.name}» من ${ref.roaster}${ref.approved ? " (معتمدة من المحمصة)" : ""}: `
      + `${dose}g بن، ${water}ml ماء${ice ? ` و${ice}g ثلج` : ""}، حرارة ${pours[0].temperature_c}°، طحن ${grind}، الوقت ~${mmss(brewSeconds(pours))}.`;
    if (iced) notes += ` قبل التشغيل حط ${ice}g ثلج في الكوب.`;
    if (k !== 1) notes += ` كبّرت الكمية من ${ref.dose}g إلى ${dose}g بنفس النسب.`;
    if (sk !== 1) notes += sk < 1 ? " خليتها أقوى بماء أقل." : " خليتها أخف بماء أكثر.";
    if (adj.length) notes += " " + adj.join(". ") + ".";
    return {
      kind: "coffee", name: name.slice(0, 60), notes,
      dose_g: dose, ratio: Number((water / dose).toFixed(1)),
      grind_size: grind, brew_seconds: Math.round(brewSeconds(pours)), grind_rpm: clamp(Math.round(ref.rpm ?? 100), 60, 120),
      color: ref.color || (iced ? "#9FC5E8" : "#B08968"),
      serve: ref.serve, ice_g: ice || undefined, total_ml: water + ice,
      basedOn: { name: ref.name, roaster: ref.roaster, approved: ref.approved, link: ref.link },
      pours,
    };
  }

  // Build on the closest roaster recipe when the request names a bean, farm, origin
  // or roaster; otherwise fall back to the calibrated rules.
  function compose(intent, text) {
    const best = match(text, intent, 1)[0];
    return best && best.relevance >= 3 ? fromReference(best.r, intent) : build(intent);
  }

  const compact = (r) => ({
    name: r.name, roaster: r.roaster, approved: r.approved, serve: r.serve, dose_g: r.dose, ice_g: r.ice || 0,
    grind_size: r.grind, grind_rpm: r.rpm,
    pours: r.pours.map((p) => [p.v, p.t, p.p, p.pat]),
  });

  // Reference block for the AI: the closest roaster recipes, or approved ones of the same serve.
  function referenceHint(intent, text) {
    if (!REF.length || intent.kind !== "coffee") return "";
    let picks = match(text, intent, 3).map((m) => m.r);
    if (!picks.length) picks = REF.filter((r) => r.serve === intent.serve && r.approved).slice(0, 3);
    return [
      "Reference recipes from Saudi roasters on the XBloom (treat them as the standard; pours are [ml, °C, pause s, pattern]):",
      ...picks.map((r) => JSON.stringify(compact(r))),
      // Only the requested serve's medians: words like "ice" in a hot request flip the iced guards.
      intent.serve === "iced"
        ? "Library medians for this style: dose 17g, hot water ≈ 10× dose, ice ≈ 6.7× dose, 92°C, grind 50, ~82 rpm, 3 pours."
        : "Library medians for this style: dose 18g, ratio 1:15, 91°C, grind 55, 100 rpm, bloom 2.3× dose, 4 pours.",
      (() => { const b = timeBand(intent.serve, intent.dose || (intent.serve === "iced" ? 17 : 15), intent.fresh); return `Total brew time (water/flow + pauses) should land ${Math.round(b.lo)}-${Math.round(b.hi)} s, typical ${Math.round(b.typical)} s; keep pauses short (bloom 15-30 s, others 5-20 s).`; })(),
    ].join("\n");
  }

  const fromRef = (ref) => fromReference(ref, { cups: 1, strength: "balanced" });

  window.XBRecipe = { parse, build, design, hint, finalize, setReference, match, compose, referenceHint, fromRef, predict, brewSeconds };
})();
