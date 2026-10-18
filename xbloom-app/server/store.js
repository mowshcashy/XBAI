// Local, on-disk session store. The XBloom password is used once and never persisted;
// only the resulting memberId/token pair is written, and only to this machine.

const fs = require("node:fs");
const path = require("node:path");

const STORE_DIR = process.env.XBLOOM_STORE_DIR || path.join(__dirname, "..", ".data");
const STORE_FILE = path.join(STORE_DIR, "session.json");

function save(creds) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function clear() {
  try { fs.unlinkSync(STORE_FILE); } catch { /* already gone */ }
}

module.exports = { save, load, clear, STORE_FILE };
