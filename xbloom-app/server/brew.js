// BLE brew controller — calls the xbloom-ble CLI (pip install xbloom-ble).
// Converts XBloom Studio recipe JSON → xbloom-ble YAML, writes a temp file,
// and spawns `xbloom brew <file> --start` to load + auto-start on the machine.
//
// Requires xbloom-ble ≥ 2.x and a previously saved machine address (xbloom init).
// The machine must allow only one BLE link: close the XBloom phone app first.

const { spawn } = require("node:child_process");
const { writeFileSync, unlinkSync } = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// xbloom-ble YAML recipe format → our JSON field names
function toYaml(spec) {
  const pours = (spec.pours || []).map((p) => {
    const obj = {
      label: p.name || "Pour",
      ml: Math.round(Number(p.volume_ml) || 30),
      temp_c: Math.round(Number(p.temperature_c) || 93),
      pattern: p.pattern || "circular",
      pause_s: Number(p.pause_seconds) || 0,
      rpm: Number(spec.grind_rpm) || 80,
      flow_ml_s: Number(p.flow_rate) || 3.0,
    };
    if (p.agitate_before) obj.agitation = true;
    const pairs = Object.entries(obj).map(([k, v]) =>
      typeof v === "string" ? `${k}: "${v}"` : `${k}: ${v}`
    );
    return `  - {${pairs.join(", ")}}`;
  }).join("\n");

  return [
    `name: "${(spec.name || "Recipe").replace(/"/g, "'")}"`,
    `dose_g: ${Number(spec.dose_g) || 15}`,
    `grind: ${Number(spec.grind_size) || 70}`,
    `ratio: ${Number(spec.ratio) || 15}`,
    `kind: ${spec.kind === "tea" ? "tea" : "custom"}`,
    `pours:`,
    pours,
    "",
  ].join("\n");
}

// Spawn xbloom CLI; onChunk receives raw stdout/stderr lines.
// Returns a Promise that resolves when the brew finishes.
function brewNow(spec, { onChunk, address, noStart = false } = {}) {
  const yamlPath = path.join(os.tmpdir(), `xbloom-recipe-${Date.now()}.yaml`);
  writeFileSync(yamlPath, toYaml(spec));

  const args = ["brew", yamlPath];
  if (!noStart) args.push("--start");
  args.push("--no-color");
  if (address) args.push("--address", address);

  return new Promise((resolve, reject) => {
    const proc = spawn("xbloom", args, { stdio: ["ignore", "pipe", "pipe"] });

    const emit = (line) => onChunk?.(line.trimEnd());
    proc.stdout.on("data", (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach(emit));
    proc.stderr.on("data", (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach(emit));

    proc.on("close", (code) => {
      try { unlinkSync(yamlPath); } catch {}
      if (code === 0) resolve();
      else reject(new Error(`xbloom exited ${code}`));
    });

    proc.on("error", (err) => {
      try { unlinkSync(yamlPath); } catch {}
      if (err.code === "ENOENT") {
        reject(new Error("xbloom غير مثبّت — شغّل: pip install 'xbloom-ble[tui]' ثم: xbloom init"));
      } else {
        reject(err);
      }
    });

    // Store ref so caller can abort
    proc.brew_proc = proc;
    resolve.proc = proc;
  });
}

// Check if the xbloom CLI is available.
function checkInstalled() {
  return new Promise((resolve) => {
    const p = spawn("xbloom", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    p.on("close", (c) => resolve(c === 0));
    p.on("error", () => resolve(false));
  });
}

module.exports = { brewNow, checkInstalled, toYaml };
