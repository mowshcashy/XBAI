// Iced pour-over guard. The XBloom heats water — it cannot brew cold — so an iced
// recipe is a hot "flash brew" poured straight onto ice in the server (Japanese method).
// Models tend to answer "iced" with cold temperatures (clamped to 40°C) and cold-brew
// style pauses; this rewrites those into a valid flash-brew recipe.
// Keep in sync with applyIcedRules() in public/app.js.

const ICED_RE = /\biced?\b|\bcold\b|\bflash\b|japanese|مثلج|ثلج|بارد|آيس|ايس كوفي/i;

const HOT_SHARE = 0.6; // 60% hot water through the bed, 40% ice in the server

function isIcedRequest(...texts) {
  return texts.some((t) => typeof t === "string" && ICED_RE.test(t));
}

function applyIcedRules(recipe) {
  if (!recipe || recipe.kind !== "coffee" || !Array.isArray(recipe.pours) || !recipe.pours.length) return recipe;

  // A ratio above 12 is the total-drink ratio; brew only the hot share of it.
  let ratio = Number(recipe.ratio) || 16;
  if (ratio > 12) ratio = Math.max(8, Math.round(ratio * HOT_SHARE * 10) / 10);
  const dose = Number(recipe.dose_g) || 15;
  const hotWater = dose * ratio;

  // Bloom stays ~2x dose; the rest of the hot water keeps the model's proportions.
  const bloom = Math.min(Math.round(dose * 2), Math.round(hotWater * 0.4));
  const rest = recipe.pours.slice(1);
  const restSum = rest.reduce((a, p) => a + (Number(p.volume_ml) || 0), 0);
  const volumes = recipe.pours.length === 1 ? [Math.round(hotWater)] : [bloom, ...rest.map((p) =>
    Math.max(1, Math.round((hotWater - bloom) * (restSum ? (Number(p.volume_ml) || 0) / restSum : 1 / rest.length))))];
  const pours = recipe.pours.map((p, i) => {
    const temp = Number(p.temperature_c);
    return {
      ...p,
      volume_ml: volumes[i],
      // Hot water does the extracting; the ice does the chilling.
      temperature_c: Number.isFinite(temp) && temp >= 90 ? Math.min(temp, 95) : 93,
      // Bloom 25-45s, then keep it moving so the drink stays bright and cold.
      pause_seconds: i === 0
        ? Math.min(45, Math.max(25, Number(p.pause_seconds) || 30))
        : Math.min(15, Math.max(0, Number(p.pause_seconds) || 0)),
    };
  });

  const iceG = Math.round(hotWater * (1 - HOT_SHARE) / HOT_SHARE);
  let name = String(recipe.name || "Iced Coffee").replace(/\s*·\s*ice \d+g$/i, "");
  if (!/iced/i.test(name)) name = `Iced ${name}`;
  name = name.slice(0, 48) + ` · ice ${iceG}g`;

  const iceNote = `☕🧊 ضع ${iceG}g ثلج في السيرفر قبل التحضير — الماء ساخن (${pours[0].temperature_c}°C) وينصبّ مباشرة على الثلج.`;
  const prior = String(recipe.notes || "").replace(/^☕🧊.*\n?/, "");
  const notes = [iceNote, prior].filter(Boolean).join("\n");

  return { ...recipe, name, ratio, pours, notes, iced: true, ice_g: iceG };
}

module.exports = { isIcedRequest, applyIcedRules };
