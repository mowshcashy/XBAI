// Ollama bridge — native HTTP API, with streaming + image (vision) support.

// With OLLAMA_API_KEY set, talk to Ollama Cloud directly (no local daemon needed).
const API_KEY = process.env.OLLAMA_API_KEY || "";
const CLOUD = !!API_KEY;
const OLLAMA_URL = (process.env.OLLAMA_URL || (CLOUD ? "https://ollama.com" : "http://127.0.0.1:11434")).replace(/\/+$/, "");

// Cloud default: gemma4:31b — the smallest Ollama Cloud chat model with vision,
// so it uses the least of the plan's usage while still reading bag photos.
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || (CLOUD ? "gemma4:31b" : "gemma3:4b");

// Models known to accept image input (verified via /api/show capabilities).
const VISION_MODELS = CLOUD
  ? [DEFAULT_MODEL, "gemma4:31b", "glm-5.3-flash"]
  : ["kimi-k3:cloud", "minimax-m3:cloud", "gemma4:31b-cloud"];

const headers = () => ({
  "Content-Type": "application/json",
  ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
});

async function listModels() {
  const resp = await fetch(`${OLLAMA_URL}/api/tags`, { headers: headers() });
  if (!resp.ok) throw new Error(`Ollama returned HTTP ${resp.status}`);
  const data = await resp.json();
  const names = (data.models || []).map((m) => m.name);
  // Default first so the picker lands on it
  return names.includes(DEFAULT_MODEL) ? [DEFAULT_MODEL, ...names.filter((n) => n !== DEFAULT_MODEL)] : names;
}

// Strip the data-URL prefix and keep the raw base64 payload Ollama expects.
function toBase64(image) {
  if (typeof image !== "string" || !image) return null;
  const i = image.indexOf(",");
  return i > 0 && image.slice(0, 5) === "data:" ? image.slice(i + 1) : image;
}

// Attach the image to the LAST user message (Ollama expects images there).
function withImages(messages, image) {
  const b64 = toBase64(image);
  if (!b64) return messages;
  const msgs = messages.map((m) => ({ ...m }));
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      msgs[i].images = [...(msgs[i].images || []), b64];
      break;
    }
  }
  return msgs;
}

async function chat(messages, { model, temperature = 0.7, format, image } = {}) {
  const body = {
    model: model || DEFAULT_MODEL,
    messages: image ? withImages(messages, image) : messages,
    stream: false,
    options: { temperature },
  };
  if (format) body.format = format;
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Ollama chat failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.message?.content ?? "";
}

// Streaming chat — onChunk(token) fires as tokens arrive; returns the full text.
async function chatStream(messages, { model, temperature = 0.5, format, image }, onChunk, signal) {
  const body = {
    model: model || DEFAULT_MODEL,
    messages: image ? withImages(messages, image) : messages,
    stream: true,
    options: { temperature },
  };
  if (format) body.format = format;

  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Ollama chat failed (${resp.status}): ${text.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        const token = evt.message?.content ?? evt.response ?? "";
        if (token) { full += token; if (onChunk) onChunk(token); }
        if (evt.error) throw new Error(String(evt.error));
      } catch { /* chunk boundary */ }
    }
  }
  return full;
}

module.exports = { listModels, chat, chatStream, OLLAMA_URL, VISION_MODELS, DEFAULT_MODEL, CLOUD };
