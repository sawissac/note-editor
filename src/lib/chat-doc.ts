/**
 * `.chat` files: one conversation with an AI model, stored as JSON. The API
 * key is never written here — only a reference to an entry in a `.gemini` or
 * `.openrouter` key file of the workspace. The system prompt is likewise a
 * reference to an entry of a `.prompt` file.
 */

export type ChatProvider = "gemini" | "openrouter";

export type ChatRole = "user" | "assistant";

/**
 * A workspace `.md` / `.txt` file referenced with `@path` in a user message.
 * Its text is snapshotted at send time, so the conversation replays the
 * same context even after the file changes or is deleted.
 */
export type ChatAttachment = {
  /** Workspace path, e.g. `notes/todo.md` — what follows the `@`. */
  path: string;
  content: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** Files referenced with `@path` (user messages only). */
  attachments?: ChatAttachment[];
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

/** An entry of a `.prompt` file, by file id and entry name. */
export type ChatPromptRef = ChatKeyRef;

export type ChatDoc = {
  version: 1;
  provider: ChatProvider;
  model: string;
  keyRef: ChatKeyRef | null;
  /** System prompt from a `.prompt` file; `null` for none. */
  promptRef: ChatPromptRef | null;
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
    promptRef: null,
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
  const promptRef = obj.promptRef as
    | Record<string, unknown>
    | null
    | undefined;
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
      ...attachmentsOf(m.attachments),
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
    promptRef:
      promptRef &&
      typeof promptRef === "object" &&
      typeof promptRef.fileId === "string" &&
      typeof promptRef.name === "string"
        ? { fileId: promptRef.fileId, name: promptRef.name }
        : null,
    temperature:
      typeof obj.temperature === "number" && Number.isFinite(obj.temperature)
        ? Math.min(2, Math.max(0, obj.temperature))
        : base.temperature,
    messages,
  };
}

function attachmentsOf(value: unknown): { attachments?: ChatAttachment[] } {
  if (!Array.isArray(value)) return {};
  const list = value.flatMap((a) =>
    a &&
    typeof a === "object" &&
    typeof (a as ChatAttachment).path === "string" &&
    typeof (a as ChatAttachment).content === "string"
      ? [
          {
            path: (a as ChatAttachment).path,
            content: (a as ChatAttachment).content,
          },
        ]
      : [],
  );
  return list.length ? { attachments: list } : {};
}

/**
 * What the model receives for a message: each referenced file in a
 * `<file path="…">` block, then the message itself.
 */
export function messageText(message: ChatMessage) {
  if (!message.attachments?.length) return message.content;
  const files = message.attachments
    .map((a) => `<file path="${a.path}">\n${a.content}\n</file>`)
    .join("\n\n");
  return `Referenced files:\n\n${files}\n\n${message.content}`;
}
