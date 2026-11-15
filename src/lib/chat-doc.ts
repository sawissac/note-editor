/**
 * `.chat` files: one conversation with an AI model, stored as JSON. The API
 * key is never written here — only a reference to an entry in a `.gemini` or
 * `.openrouter` key file of the workspace.
 */

export type ChatProvider = "gemini" | "openrouter";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  at: number;
  /** Model that wrote an assistant reply. */
  model?: string;
  /** The request failed; `content` holds the error text. */
  error?: boolean;
};

export type ChatKeyRef = {
  /** Workspace id of the `.gemini` / `.openrouter` file. */
  fileId: string;
  /** Entry name inside that file. */
  name: string;
};

export type ChatDoc = {
  version: 1;
  provider: ChatProvider;
  model: string;
  keyRef: ChatKeyRef | null;
  /** System prompt; empty for none. */
  system: string;
  temperature: number;
  messages: ChatMessage[];
};

export const PROVIDERS: {
  value: ChatProvider;
  label: string;
  /** Key-file extension holding this provider's keys. */
  extension: string;
  defaultModel: string;
}[] = [
  {
    value: "gemini",
    label: "Gemini",
    extension: "gemini",
    defaultModel: "gemini-2.5-flash",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    extension: "openrouter",
    defaultModel: "openrouter/auto",
  },
];

export function providerInfo(provider: ChatProvider) {
  return PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];
}

export function newMessageId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyChat(): ChatDoc {
  return {
    version: 1,
    provider: "gemini",
    model: providerInfo("gemini").defaultModel,
    keyRef: null,
    system: "",
    temperature: 1,
    messages: [],
  };
}

export function serializeChat(doc: ChatDoc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function parseChat(text: string): ChatDoc {
  const base = emptyChat();
  if (!text.trim()) return base;
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Expected a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const provider: ChatProvider =
    obj.provider === "openrouter" ? "openrouter" : "gemini";
  const ref = obj.keyRef as Record<string, unknown> | null | undefined;
  const messages: ChatMessage[] = [];
  for (const item of Array.isArray(obj.messages) ? obj.messages : []) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") continue;
    messages.push({
      id: typeof m.id === "string" ? m.id : newMessageId(),
      role: m.role,
      content: typeof m.content === "string" ? m.content : "",
      at: typeof m.at === "number" ? m.at : 0,
      ...(typeof m.model === "string" ? { model: m.model } : {}),
      ...(m.error === true ? { error: true } : {}),
    });
  }
  return {
    version: 1,
    provider,
    model:
      typeof obj.model === "string" && obj.model.trim()
        ? obj.model
        : providerInfo(provider).defaultModel,
    keyRef:
      ref &&
      typeof ref === "object" &&
      typeof ref.fileId === "string" &&
      typeof ref.name === "string"
        ? { fileId: ref.fileId, name: ref.name }
        : null,
    system: typeof obj.system === "string" ? obj.system : base.system,
    temperature:
      typeof obj.temperature === "number" && Number.isFinite(obj.temperature)
        ? Math.min(2, Math.max(0, obj.temperature))
        : base.temperature,
    messages,
  };
}
