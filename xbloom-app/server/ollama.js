// Ollama bridge — native HTTP API, with streaming + image (vision) support.

const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");

// Models known to accept image input (verified on this machine via /api/chat probe).
const VISION_MODELS = ["kimi-k3:cloud", "minimax-m3:cloud", "gemma4:31b-cloud"];

async function listModels() {
  const resp = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!resp.ok) throw new Error(`Ollama returned HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.models || []).map((m) => m.name);
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
    model: model || process.env.OLLAMA_MODEL || "gemma3:4b",
    messages: image ? withImages(messages, image) : messages,
    stream: false,
    options: { temperature },
  };
  if (format) body.format = format;
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    model: model || process.env.OLLAMA_MODEL || "gemma3:4b",
    messages: image ? withImages(messages, image) : messages,
    stream: true,
    options: { temperature },
  };
  if (format) body.format = format;

  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

module.exports = { listModels, chat, chatStream, OLLAMA_URL, VISION_MODELS };
