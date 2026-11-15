/**
 * Streaming chat calls straight from the browser to Gemini and OpenRouter.
 * Both answer with server-sent events; `onDelta` receives each text chunk.
 */
import type { ChatMessage, ChatProvider } from "@/lib/chat-doc";

export type ChatRequest = {
  provider: ChatProvider;
  apiKey: string;
  model: string;
  system: string;
  temperature: number;
  /** Conversation so far, oldest first; failed replies are skipped. */
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** Readable message from an error response body. */
async function responseError(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const msg =
      typeof body.error === "string"
        ? body.error
        : (body.error?.message ?? body.message);
    if (msg) return new Error(`${res.status}: ${msg}`);
  } catch {
    // Not JSON.
  }
  return new Error(`${res.status} ${res.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`);
}

/** Calls `onData` with each `data:` payload of an SSE response. */
async function readEvents(res: Response, onData: (data: string) => void) {
  if (!res.body) throw new Error("The response has no body to stream.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (line.startsWith("data:")) onData(line.slice(5).trim());
    }
    if (done) break;
  }
}

function usable(messages: ChatMessage[]) {
  return messages.filter((m) => !m.error && m.content.trim());
}

async function streamGemini(req: ChatRequest) {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    signal: req.signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": req.apiKey,
    },
    body: JSON.stringify({
      contents: usable(req.messages).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      ...(req.system.trim()
        ? { systemInstruction: { parts: [{ text: req.system }] } }
        : {}),
      generationConfig: { temperature: req.temperature },
    }),
  });
  if (!res.ok) throw await responseError(res);
  let wrote = false;
  let blocked = "";
  await readEvents(res, (data) => {
    if (!data) return;
    const chunk = JSON.parse(data) as {
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
        finishReason?: string;
      }[];
      promptFeedback?: { blockReason?: string };
      error?: { message?: string };
    };
    if (chunk.error) throw new Error(chunk.error.message ?? "Gemini error");
    if (chunk.promptFeedback?.blockReason) {
      blocked = chunk.promptFeedback.blockReason;
    }
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.text && !part.thought) {
        wrote = true;
        req.onDelta(part.text);
      }
    }
    const reason = candidate?.finishReason;
    if (reason && reason !== "STOP" && reason !== "MAX_TOKENS" && !wrote) {
      blocked = reason;
    }
  });
  if (!wrote && blocked) throw new Error(`Gemini returned no text (${blocked}).`);
}

async function streamOpenRouter(req: ChatRequest) {
  const messages = [
    ...(req.system.trim() ? [{ role: "system", content: req.system }] : []),
    ...usable(req.messages).map((m) => ({ role: m.role, content: m.content })),
  ];
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    signal: req.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.apiKey}`,
      "X-Title": "Bento",
    },
    body: JSON.stringify({
      model: req.model,
      messages,
      temperature: req.temperature,
      stream: true,
    }),
  });
  if (!res.ok) throw await responseError(res);
  await readEvents(res, (data) => {
    if (!data || data === "[DONE]") return;
    const chunk = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null } }[];
      error?: { message?: string };
    };
    if (chunk.error) throw new Error(chunk.error.message ?? "OpenRouter error");
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) req.onDelta(text);
  });
}

export function streamChat(req: ChatRequest) {
  return req.provider === "gemini" ? streamGemini(req) : streamOpenRouter(req);
}

/** Model ids the key can use, for the model picker's suggestions. */
export async function listModels(
  provider: ChatProvider,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (provider === "gemini") {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=1000`, {
      signal,
      headers: { "x-goog-api-key": apiKey },
    });
    if (!res.ok) throw await responseError(res);
    const body = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
    };
    return (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .sort();
  }
  const res = await fetch(`${OPENROUTER_BASE}/models`, { signal });
  if (!res.ok) throw await responseError(res);
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? []).map((m) => m.id).sort();
}
