import "@/styles/chat-pane.css";

import {
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconMessageForward,
  IconPencil,
  IconPlus,
  IconPlayerStopFilled,
  IconReplace,
  IconScript,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { parseApiKeys } from "@/lib/api-keys";
import { type AskAiRequest, answerBody } from "@/lib/ask-ai";
import {
  type ChatMessage,
  type ChatProvider,
  newMessageId,
  providerInfo,
} from "@/lib/chat-doc";
import { streamChat } from "@/lib/chat-providers";
import { cn } from "@/lib/cn";
import { extensionOf, kindOf } from "@/lib/file-types";
import { storage } from "@/lib/storage";
import { askAiAboutSelection, createAtPath } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { ChatMarkdown } from "@/features/editors/ChatMarkdown";
import { PromptEditor } from "@/features/editors/PromptPicker";
import {
  type PromptChoice,
  usePromptLibrary,
} from "@/features/editors/use-prompts";

/** One-click questions; each is sent as typed. */
const QUICK_ASKS = [
  "Explain this",
  "Summarize this",
  "Improve the writing",
  "Find problems",
] as const;

const PANEL_WIDTH = 440;
const GAP = 8;

type AiKey = { provider: ChatProvider; key: string; name: string };

/**
 * First usable API key in the workspace: Gemini key files before
 * OpenRouter ones, first entry of each. `undefined` while loading.
 */
function useAiKey(): AiKey | null | undefined {
  const nodes = useAppSelector((s) => s.fs.nodes);
  const files = React.useMemo(
    () =>
      Object.values(nodes)
        .filter((n) => n.type === "file" && kindOf(n.name) === "apikeys")
        .sort(
          (a, b) =>
            Number(extensionOf(a.name) !== "gemini") -
            Number(extensionOf(b.name) !== "gemini"),
        ),
    [nodes],
  );
  const [found, setFound] = React.useState<AiKey | null | undefined>();
  React.useEffect(() => {
    let live = true;
    void (async () => {
      for (const file of files) {
        const text = await storage.getContent(file.id).catch(() => null);
        const entry = parseApiKeys(
          typeof text === "string" ? text : "",
        ).entries.find((e) => e.key.trim());
        if (entry) {
          const provider: ChatProvider =
            extensionOf(file.name) === "openrouter" ? "openrouter" : "gemini";
          if (live) setFound({ provider, key: entry.key, name: entry.name });
          return;
        }
      }
      if (live) setFound(null);
    })();
    return () => {
      live = false;
    };
  }, [files]);
  return found;
}

/** Below the anchor when it fits, else above; clamped to the viewport. */
function placement(anchor: DOMRect | null, pane: DOMRect | undefined) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(
    8,
    Math.min(
      anchor ? anchor.left : (pane?.right ?? vw) - PANEL_WIDTH - 12,
      vw - PANEL_WIDTH - 8,
    ),
  );
  if (!anchor) return { left, top: (pane?.top ?? 48) + 8, maxHeight: vh * 0.7 };
  const below = vh - anchor.bottom - GAP - 8;
  const above = anchor.top - GAP - 8;
  return below >= 260 || below >= above
    ? { left, top: anchor.bottom + GAP, maxHeight: Math.max(200, below) }
    : { left, bottom: vh - anchor.top + GAP, maxHeight: Math.max(200, above) };
}

/**
 * Inline "Ask AI" for any editor: a floating card next to the selection (or
 * at the pane's top right for the whole file). Questions stream back as
 * Markdown; follow-ups keep the thread. The answer can be copied, swapped
 * in for the selection (code editors), or carried on in a chat.
 *
 * Uses the first key in the workspace's `.gemini` / `.openrouter` files
 * with that provider's default model. Beside the built-in quick questions,
 * each prompt of the workspace's `.prompt` files is a chip that sends its
 * text; its pencil (or "+") opens a form that writes the file.
 *
 * CSS: BEM block `ask-ai-panel` (`src/styles/ask-ai.css`); answers reuse
 * `chat-markdown`.
 */
export default function AskAiPanel({
  fileId,
  fileName,
  request,
  paneRect,
  onClose,
}: {
  fileId: string;
  fileName: string;
  request: AskAiRequest;
  paneRect: DOMRect | undefined;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const aiKey = useAiKey();
  const promptLibrary = usePromptLibrary();
  // `undefined`: the quick questions; `null`: a new prompt; else the one edited.
  const [editing, setEditing] = React.useState<PromptChoice | null>();
  // Escape leaves the prompt form first, not the whole panel.
  const editingRef = React.useRef(false);
  editingRef.current = editing !== undefined;
  const [question, setQuestion] = React.useState("");
  const [thread, setThread] = React.useState<ChatMessage[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [replaced, setReplaced] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const answerRef = React.useRef<HTMLDivElement>(null);

  // Focus the question box once the key lookup settles (a disabled box
  // can't take focus); the editor keeps focus until then.
  const ready = aiKey !== undefined;
  React.useEffect(() => {
    if (ready) inputRef.current?.focus();
  }, [ready]);
  React.useEffect(() => () => abortRef.current?.abort(), []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (editingRef.current) {
          setEditing(undefined);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  // Keep the newest words in view while streaming.
  React.useLayoutEffect(() => {
    const el = answerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  const model = aiKey ? providerInfo(aiKey.provider).defaultModel : "";
  const last = thread.at(-1);
  const answer = last?.role === "assistant" && !last.error ? last.content : "";

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !aiKey) return;
    setQuestion("");
    setCopied(false);
    setReplaced(false);
    // The context rides on the first question only.
    const user: ChatMessage = {
      id: newMessageId(),
      role: "user",
      content: q,
      at: Date.now(),
      ...(thread.length
        ? {}
        : {
            attachments: [
              {
                path: `${fileName} (${request.where})`,
                content: request.context,
              },
            ],
          }),
    };
    const reply: ChatMessage = {
      id: newMessageId(),
      role: "assistant",
      content: "",
      at: Date.now(),
      model,
    };
    const history = [...thread, user];
    setThread([...history, reply]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat({
        provider: aiKey.provider,
        apiKey: aiKey.key,
        model,
        system:
          `You help with the file "${fileName}" in a notes and documents app. ` +
          "Answer briefly in Markdown. When asked to rewrite or fix the text, " +
          "reply with only the new text (code in one fenced block).",
        temperature: 0.4,
        messages: history,
        signal: controller.signal,
        onDelta: (delta) =>
          setThread((t) =>
            t.map((m) =>
              m.id === reply.id ? { ...m, content: m.content + delta } : m,
            ),
          ),
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        setThread((t) =>
          t.map((m) =>
            m.id === reply.id ? { ...m, content: message, error: true } : m,
          ),
        );
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const place = placement(request.anchor, paneRect);

  return createPortal(
    <section
      className="ask-ai-panel"
      style={{
        left: place.left,
        top: place.top,
        bottom: place.bottom,
        maxHeight: place.maxHeight,
        width: PANEL_WIDTH,
      }}
      role="dialog"
      aria-label="Ask AI"
      data-testid="ask-ai-panel"
    >
      <header className="ask-ai-panel__header">
        <IconSparkles aria-hidden className="ask-ai-panel__logo" />
        <span className="ask-ai-panel__title">Ask AI</span>
        <span
          className="ask-ai-panel__context"
          title={request.context.slice(0, 400)}
        >
          {fileName} · {request.where}
        </span>
        <button
          type="button"
          className="ask-ai-panel__icon-button"
          aria-label="Close"
          data-testid="ask-ai-panel-close-button"
          onClick={onClose}
        >
          <IconX aria-hidden />
        </button>
      </header>

      {aiKey === null ? (
        <div className="ask-ai-panel__notice">
          <p className="ask-ai-panel__notice-text">
            Add an API key first: a <code>.gemini</code> or{" "}
            <code>.openrouter</code> file holding{" "}
            <code>{'{ "name": "your-key" }'}</code>.
          </p>
          <button
            type="button"
            className="ask-ai-panel__action"
            data-testid="ask-ai-panel-create-key-button"
            onClick={() => {
              dispatch(createAtPath(null, "keys.gemini", "file"));
              onClose();
            }}
          >
            Create keys.gemini
          </button>
        </div>
      ) : (
        <>
          {thread.length ? (
            <div ref={answerRef} className="ask-ai-panel__thread">
              {thread.map((m) =>
                m.role === "user" ? (
                  <p key={m.id} className="ask-ai-panel__question">
                    {m.content}
                  </p>
                ) : m.error ? (
                  <p key={m.id} className="ask-ai-panel__error">
                    {m.content}
                  </p>
                ) : m.content ? (
                  <ChatMarkdown key={m.id} text={m.content} />
                ) : (
                  <p
                    key={m.id}
                    className="ask-ai-panel__thinking"
                    role="status"
                  >
                    Thinking…
                  </p>
                ),
              )}
            </div>
          ) : editing !== undefined ? (
            <div className="ask-ai-panel__editor">
              <PromptEditor
                key={editing ? `${editing.fileId}/${editing.name}` : "new"}
                prompt={editing}
                testIdPrefix="ask-ai-panel"
                onSave={promptLibrary.save}
                onDelete={promptLibrary.remove}
                onDone={() => {
                  setEditing(undefined);
                  inputRef.current?.focus();
                }}
              />
            </div>
          ) : (
            <div
              className="ask-ai-panel__quick"
              role="group"
              aria-label="Quick questions"
            >
              {QUICK_ASKS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="ask-ai-panel__chip"
                  disabled={!aiKey}
                  onClick={() => void ask(q)}
                >
                  {q}
                </button>
              ))}
              {/* The workspace's own prompts (`.prompt` files), sent as typed. */}
              {(promptLibrary.prompts ?? []).map((p) => (
                <span
                  key={`${p.fileId}/${p.name}`}
                  className="ask-ai-panel__custom"
                >
                  <button
                    type="button"
                    className="ask-ai-panel__chip ask-ai-panel__chip--custom"
                    title={p.text}
                    disabled={!aiKey || !p.text.trim()}
                    data-testid={`ask-ai-panel-prompt-${p.fileId}-$<span className="ask-ai-panel__chip-text">{p.name}</span>-button`}
                    onClick={() => void ask(p.text)}
                  >
                    <IconScript
                      aria-hidden
                      className="ask-ai-panel__chip-icon"
                    />
                    {p.name}
                  </button>
                  <button
                    type="button"
                    className="ask-ai-panel__chip-edit"
                    aria-label={`Edit prompt ${p.name}`}
                    title="Edit"
                    data-testid={`ask-ai-panel-prompt-${p.fileId}-${p.name}-edit-button`}
                    onClick={() => setEditing(p)}
                  >
                    <IconPencil aria-hidden />
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="ask-ai-panel__chip ask-ai-panel__chip--add"
                aria-label="New prompt"
                title="New prompt"
                data-testid="ask-ai-panel-prompt-new-button"
                onClick={() => setEditing(null)}
              >
                <IconPlus aria-hidden className="ask-ai-panel__chip-icon" />
              </button>
            </div>
          )}

          {answer && !busy ? (
            <div className="ask-ai-panel__actions">
              <button
                type="button"
                className="ask-ai-panel__action"
                data-testid="ask-ai-panel-copy-button"
                onClick={() =>
                  void navigator.clipboard.writeText(answer).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  })
                }
              >
                {copied ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
                Copy
              </button>
              {request.replace ? (
                <button
                  type="button"
                  className="ask-ai-panel__action"
                  data-testid="ask-ai-panel-replace-button"
                  title="Swap the selected text for this answer (undo with ⌘Z)"
                  onClick={() => {
                    request.replace!(answerBody(answer));
                    setReplaced(true);
                  }}
                >
                  {replaced ? (
                    <IconCheck aria-hidden />
                  ) : (
                    <IconReplace aria-hidden />
                  )}
                  {replaced ? "Replaced" : "Replace selection"}
                </button>
              ) : null}
              <button
                type="button"
                className="ask-ai-panel__action"
                data-testid="ask-ai-panel-chat-button"
                title="Send this context to a chat and keep going there"
                onClick={() => {
                  dispatch(
                    askAiAboutSelection(fileId, request.context, request.where),
                  );
                  onClose();
                }}
              >
                <IconMessageForward aria-hidden />
                Open in chat
              </button>
            </div>
          ) : null}

          <form
            className="ask-ai-panel__form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={question}
              disabled={aiKey === null}
              placeholder={
                thread.length ? "Ask a follow-up…" : "Ask about this…"
              }
              className="ask-ai-panel__input"
              data-testid="ask-ai-panel-input"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                // Enter asks; Shift+Enter breaks the line.
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void ask(question);
                }
              }}
            />
            {busy ? (
              <button
                type="button"
                className={cn("ask-ai-panel__send", "ask-ai-panel__send--stop")}
                aria-label="Stop"
                data-testid="ask-ai-panel-stop-button"
                onClick={() => abortRef.current?.abort()}
              >
                <IconPlayerStopFilled aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                className="ask-ai-panel__send"
                aria-label="Ask"
                data-testid="ask-ai-panel-send-button"
                disabled={!question.trim() || !aiKey}
              >
                <IconArrowUp aria-hidden />
              </button>
            )}
          </form>
          {aiKey ? (
            <p className="ask-ai-panel__meta">
              {providerInfo(aiKey.provider).label} · {model} · key “{aiKey.name}
              ”
            </p>
          ) : null}
        </>
      )}
    </section>,
    document.body,
  );
}
