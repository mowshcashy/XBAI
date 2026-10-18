// OpenRouter bridge — cloud AI with many provider models.
// Docs: https://openrouter.ai/docs

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

// Curated defaults shown even without an API key.
const DEFAULT_MODELS = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", vision: true },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", vision: true },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", vision: true },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", vision: true },
  { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5", provider: "Google", vision: true },
  { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5", provider: "Google", vision: true },
  { id: "mistralai/mistral-small-3.2-24b-instruct:free", name: "Mistral Small (free)", provider: "Mistral", vision: false },
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (free)", provider: "Meta", vision: false },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", provider: "Alibaba", vision: false },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (free)", provider: "DeepSeek", vision: false },
];

function getApiKey() {
  return process.env.OPENROUTER_API_KEY || "";
}

function hasKey() {
  return !!getApiKey();
}

// Build messages with base64 image support (OpenAI vision format).
function buildMessages(messages, image) {
  if (!image) return messages;
  const url = typeof image === "string" && image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
  return messages.map((m, i) => {
    if (i === messages.length - 1 && m.role === "user") {
      return {
        ...m,
        content: [
          { type: "text", text: typeof m.content === "string" ? m.content : "" },
          { type: "image_url", image_url: { url } },
        ],
      };
    }
    return m;
  });
}

async function listModels() {
  const key = getApiKey();
  if (!key) return DEFAULT_MODELS;
  try {
    const resp = await fetch(`${OPENROUTER_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) return DEFAULT_MODELS;
    const data = await resp.json();
    return (data.data || [])
      .filter((m) => m.id && m.name)
      .slice(0, 120)
      .map((m) => ({
        id: m.id,
        name: m.name,
        provider: (m.id.split("/")[0] || "").replace(/-/g, " "),
        vision: !!(m.architecture?.modality?.includes("image")),
      }));
  } catch {
    return DEFAULT_MODELS;
  }
}

async function chat(messages, { model, temperature = 0.7, image } = {}) {
  const key = getApiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY is not set in .env");
  const resp = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "http://localhost:8787",
      "X-Title": "XBloom Studio",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS[0].id,
      messages: image ? buildMessages(messages, image) : messages,
      temperature,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenRouter (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function chatStream(messages, { model, temperature = 0.5, image }, onChunk, signal) {
  const key = getApiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY غير مضبوط. أضفه في ملف .env");
  const resp = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "http://localhost:8787",
      "X-Title": "XBloom Studio",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS[0].id,
      messages: image ? buildMessages(messages, image) : messages,
      temperature,
      stream: true,
    }),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenRouter (${resp.status}): ${text.slice(0, 300)}`);
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
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") break;
      try {
        const evt = JSON.parse(payload);
        const token = evt.choices?.[0]?.delta?.content ?? "";
        if (token) { full += token; if (onChunk) onChunk(token); }
      } catch { /* partial chunk */ }
    }
  }
  return full;
}

module.exports = { listModels, chat, chatStream, DEFAULT_MODELS, hasKey };
