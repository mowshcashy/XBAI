// DeepSeek bridge — OpenAI-compatible Chat Completions (https://api-docs.deepseek.com).
// deepseek-flash reads images and supports JSON output; thinking mode is switched off
// because a recipe is a short structured answer and thinking only adds latency.

const BASE = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const VISION_MODELS = new Set(["deepseek-flash"]);

const key = () => process.env.DEEPSEEK_API_KEY || "";
const hasKey = () => !!key();
const supportsVision = (model) => VISION_MODELS.has(model || DEFAULT_MODEL);

function withImage(messages, image) {
  if (!image) return messages;
  const url = String(image).startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
  return messages.map((m, i) => (i === messages.length - 1 && m.role === "user"
    ? { ...m, content: [{ type: "text", text: typeof m.content === "string" ? m.content : "" }, { type: "image_url", image_url: { url } }] }
    : m));
}

function body(messages, { model, temperature = 0.4, image, json, stream }) {
  return JSON.stringify({
    model: model || DEFAULT_MODEL,
    messages: withImage(messages, image),
    temperature,
    max_tokens: 2000,
    thinking: { type: "disabled" },
    ...(json ? { response_format: { type: "json_object" } } : {}),
    ...(stream ? { stream: true } : {}),
  });
}

async function request(payload, signal) {
  if (!hasKey()) throw new Error("DEEPSEEK_API_KEY غير مضبوط على السيرفر");
  const resp = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: payload,
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`DeepSeek (${resp.status}): ${text.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  return resp;
}

async function chat(messages, opts = {}) {
  const resp = await request(body(messages, opts), opts.signal);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function chatStream(messages, opts, onChunk, signal) {
  const resp = await request(body(messages, { ...opts, stream: true }), signal);
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
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const token = JSON.parse(payload).choices?.[0]?.delta?.content ?? "";
        if (token) { full += token; onChunk?.(token); }
      } catch { /* partial chunk */ }
    }
  }
  return full;
}

module.exports = { chat, chatStream, hasKey, supportsVision, DEFAULT_MODEL };
