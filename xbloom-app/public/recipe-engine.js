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
    light:       { label: "فاتح",        temp: 94, grind: 62, ratio: 15.5, rpm: 100, bloomX: 2.5, bloomPause: 45, mains: 3, pattern: "spiral",   pauses: [20, 15, 0], color: "#D4BFA0" },
    medium:      { label: "متوسط",       temp: 91, grind: 72, ratio: 15.5, rpm: 90,  bloomX: 2.5, bloomPause: 40, mains: 3, pattern: "circular", pauses: [15, 10, 0], color: "#B08968" },
    medium_dark: { label: "متوسط غامق",  temp: 89, grind: 80, ratio: 16,   rpm: 85,  bloomX: 2.2, bloomPause: 35, mains: 2, pattern: "circular", pauses: [10, 0],     color: "#8B5E3C" },
    dark:        { label: "غامق",        temp: 87, grind: 88, ratio: 16.5, rpm: 80,  bloomX: 2.0, bloomPause: 30, mains: 2, pattern: "circular", pauses: [10, 0],     color: "#6F4E37" },
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
      dose: null, ratio: null, totalMl: null, teaType: "black",
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
    };
    Object.assign(intent, Object.fromEntries(Object.entries(overrides).filter(([, v]) => v != null)));
    return intent;
  }

  function splitWater(total, weights) {
    const out = weights.map((w) => Math.round(total * w));
    out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
    return out;
  }

  function buildCoffee(i) {
    const R = ROASTS[i.roast] || ROASTS.medium;
    const iced = i.serve === "iced";
    let grind = R.grind, temp = R.temp, ratio = R.ratio, bloomX = R.bloomX, bloomPause = R.bloomPause;

    if (i.process === "washed") grind -= 3;
    if (i.process === "natural" || i.process === "honey") { grind += 4; ratio -= 0.3; }
    if (i.process === "anaerobic") { grind += 5; temp -= 1; ratio -= 0.3; }
    if (i.strength === "strong") ratio -= 1.5;
    if (i.strength === "weak") ratio += 1.5;
    if (i.fresh) { bloomX += 0.5; bloomPause += 10; }
    if (i.ratio) ratio = i.ratio;

    const perCup = iced ? 18 : 15;
    let dose = i.dose || (i.cups >= 2 ? (iced ? 25 : 24) : i.cups > 1 ? (iced ? 22 : 20) : perCup);
    dose = clamp(round(dose), 8, 31);

    let total;
    if (i.totalMl) total = i.totalMl;
    else if (iced) total = dose * (ratio - 0.5);
    else total = dose * ratio;
    total = Math.round(clamp(total, dose * 8, dose * 20));

    let ice = 0, hotWater = total;
    if (iced) {
      ice = round(total * 0.4, 5);
      hotWater = total - ice;
      grind -= 6;
      temp += 1;
      bloomX = Math.min(bloomX, 2);
      bloomPause = Math.min(bloomPause, 35);
    }
    grind = clamp(Math.round(grind), 40, 120);
    temp = clamp(Math.round(temp), 80, 95);

    const bloom = Math.round(dose * bloomX);
    let mains = iced ? 2 : R.mains;
    let rest = hotWater - bloom;
    while (rest / mains > 240) mains++;
    const weights = mains === 2 ? [0.55, 0.45] : mains === 3 ? [0.4, 0.33, 0.27] : Array(mains).fill(1 / mains);
    const mainVols = splitWater(rest, weights);
    const pauses = iced ? [10, 0] : R.pauses;

    const pours = [{
      name: "Bloom", volume_ml: bloom, temperature_c: temp, pattern: "spiral",
      flow_rate: 3.0, pause_seconds: bloomPause, agitate_before: false, agitate_after: i.roast !== "dark",
    }, ...mainVols.map((v, k) => ({
      name: `Pour ${k + 2}`, volume_ml: v,
      temperature_c: i.roast === "dark" || i.roast === "medium_dark" ? temp - k : temp,
      pattern: k === mainVols.length - 1 && !iced && i.roast !== "light" ? "centered" : R.pattern,
      flow_rate: 3.2, pause_seconds: pauses[k] ?? 0, agitate_before: false, agitate_after: false,
    }))];

    const originLabel = i.origin ? i.origin.label : "";
    const nameCore = originLabel ? `${originLabel} ${R.label}` : `تحميص ${R.label}`;
    const name = iced
      ? `آيس ${nameCore} (ثلج ${ice}g)`
      : `${originLabel ? nameCore : `قهوة ${nameCore}`}${i.cups >= 2 ? " لكوبين" : ""}`;
    const machineRatio = Number((hotWater / dose).toFixed(1));

    const parts = [];
    parts.push(`تحميص ${R.label}${i.process ? ` ${PROCESS_LABEL[i.process]}` : ""}${i.origin ? ` (${i.origin.flavor})` : ""}`);
    parts.push(`حرارة ${temp}° وطحن ${grind}${iced ? " (أنعم من العادي لأن الماء أقل)" : ""}`);
    parts.push(`${dose}g بن مع ${hotWater}ml ماء${iced ? ` حار` : ` (نسبة 1:${machineRatio})`}`);
    parts.push(`بلوم ${bloom}ml وانتظار ${bloomPause} ثانية ثم ${mainVols.length} صبات`);
    let notes = parts.join("، ") + ".";
    if (iced) notes += ` قبل التشغيل حط ${ice}g ثلج في الكوب أو الإبريق تحت الجهاز — الماء الحار يذوب الثلج ويطلع لك ${total}ml قهوة باردة متوازنة.`;
    if (i.coldBrewAsked) notes += " ملاحظة: الكولد برو يحتاج نقع ساعات وما يسويه الجهاز، فسويت لك آيس بالطريقة اليابانية بنفس الروح.";
    if (i.strength === "strong") notes += " خليتها أقوى بنسبة ماء أقل.";
    if (i.strength === "weak") notes += " خليتها أخف بنسبة ماء أعلى.";

    return {
      kind: "coffee", name: name.slice(0, 60), notes,
      dose_g: dose, ratio: machineRatio, grind_size: grind, grind_rpm: R.rpm,
      color: iced ? "#9FC5E8" : R.color,
      roast: i.roast === "medium_dark" ? "dark" : i.roast, process: i.process || undefined,
      serve: i.serve, ice_g: ice || undefined, total_ml: total,
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
    ].filter(Boolean);
    return `Parsed request: ${bits.join(", ")}.`;
  }

  // Make an AI-produced recipe respect the request (iced conversion, machine limits, water balance).
  function finalize(recipe, intent) {
    if (!recipe) return recipe;
    const r = { ...recipe };
    if (r.kind === "tea" || !Array.isArray(r.pours) || !r.pours.length) return { ...r, serve: r.serve || intent?.serve || "hot" };
    r.dose_g = clamp(Number(r.dose_g) || 15, 1, 31);
    r.grind_size = clamp(Math.round(Number(r.grind_size) || 70), 40, 120);
    r.grind_rpm = clamp(Math.round(Number(r.grind_rpm) || 80), 60, 120);
    r.pours = r.pours.slice(0, 7).map((p) => ({ ...p, temperature_c: clamp(Math.round(Number(p.temperature_c) || 92), 40, 95) }));
    const sum = r.pours.reduce((a, p) => a + (Number(p.volume_ml) || 0), 0);

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
      r.grind_size = clamp(r.grind_size - 6, 40, 120);
      r.name = `آيس ${String(r.name || "").replace(/^آيس\s*/, "")} (ثلج ${ice}g)`.slice(0, 60);
      r.notes = `${r.notes || ""} قبل التشغيل حط ${ice}g ثلج في الكوب — الماء الحار يذوب الثلج ويطلع ${total}ml قهوة باردة.`.trim();
    }
    if (r.ice_g && !String(r.name || "").includes("ثلج")) {
      const suffix = ` (ثلج ${Math.round(r.ice_g)}g)`;
      r.name = String(r.name || "آيس").slice(0, 60 - suffix.length) + suffix;
    }
    const water = r.pours.reduce((a, p) => a + p.volume_ml, 0);
    r.ratio = Number((water / r.dose_g).toFixed(1));
    r.serve = r.ice_g ? "iced" : (r.serve || intent?.serve || "hot");
    return r;
  }

  window.XBRecipe = { parse, build, design, hint, finalize };
})();
