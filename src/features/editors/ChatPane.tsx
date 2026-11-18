import "@/styles/chat-pane.css";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconFileText,
  IconKey,
  IconMessageChatbot,
  IconPlayerStopFilled,
  IconRefresh,
  IconSend2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import * as React from "react";

import { parseApiKeys } from "@/lib/api-keys";
import {
  type ChatAttachment,
  type ChatDoc,
  type ChatMessage,
  type ChatProvider,
  emptyChat,
  newMessageId,
  parseChat,
  providerInfo,
  serializeChat,
} from "@/lib/chat-doc";
import { listModels, streamChat } from "@/lib/chat-providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";
import { extensionOf, kindOf } from "@/lib/file-types";
import { storage } from "@/lib/storage";
import { createAtPath, openFile, saveContent } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { uiActions } from "@/store/ui-slice";
import { getPath } from "@/store/selectors";
import {
  ChatComposer,
  type ChatComposerHandle,
  type MentionFile,
} from "@/features/editors/ChatComposer";
import { ChatMarkdown } from "@/features/editors/ChatMarkdown";
import { ChatSetup } from "@/features/editors/ChatPickers";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";
import {
  useFileEntries,
  usePromptLibrary,
} from "@/features/editors/use-prompts";

/** One entry of a `.gemini` / `.openrouter` file in the workspace. */
type KeyOption = {
  fileId: string;
  /** Workspace path of the key file, for the picker. */
  path: string;
  name: string;
  key: string;
};

/** No bytes for this long while waiting for a reply → give up. */
const IDLE_TIMEOUT_MS = 180_000;

const isMac = navigator.platform.toLowerCase().includes("mac");

/** Extensions a chat can reference with `@path`. */
const MENTIONABLE = new Set(["md", "markdown", "txt"]);
/** Longest file text sent per reference, so one huge file can't blow the context. */
const MAX_ATTACHMENT_CHARS = 200_000;

/** Every `.md` / `.txt` file in the workspace, by path. */
function useMentionFiles(): MentionFile[] {
  const nodes = useAppSelector((s) => s.fs.nodes);
  return React.useMemo(
    () =>
      Object.values(nodes)
        .filter(
          (n) =>
            n.type === "file" &&
            MENTIONABLE.has(extensionOf(n.name).toLowerCase()),
        )
        .map((n) => ({ id: n.id, path: getPath(nodes, n.id).join("/") }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [nodes],
  );
}

/**
 * The files a message references: every `@path` of a known `.md` / `.txt`
 * file, read now. Markdown escapes (`my\_file.md`) are undone first.
 */
async function resolveAttachments(
  text: string,
  files: MentionFile[],
): Promise<ChatAttachment[]> {
  const plain = text.replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, "$1");
  const referenced = files.filter((f) => plain.includes(`@${f.path}`));
  return Promise.all(
    referenced.map(async (f) => {
      const value = await storage.getContent(f.id).catch(() => null);
      const content = typeof value === "string" ? value : "";
      return {
        path: f.path,
        content:
          content.length > MAX_ATTACHMENT_CHARS
            ? `${content.slice(0, MAX_ATTACHMENT_CHARS)}\n…(truncated)`
            : content,
      };
    }),
  );
}

/** Keys for `provider` found in the workspace's key files. */
function useKeyOptions(provider: ChatProvider) {
  const extension = providerInfo(provider).extension;
  const isKeyFile = React.useCallback(
    (name: string) =>
      kindOf(name) === "apikeys" && extensionOf(name) === extension,
    [extension],
  );
  const { entries, files } = useFileEntries(isKeyFile, readKeys);
  return { options: entries as KeyOption[] | null, keyFiles: files };
}

function readKeys(text: string) {
  return parseApiKeys(text).entries.filter((e) => e.key.trim());
}

/**
 * `.chat` files: a conversation with Gemini or OpenRouter. The key comes from
 * a `.gemini` / `.openrouter` file in the workspace (only a reference to it is
 * saved here); replies stream in and render as Markdown. Requests go straight
 * from the browser to the provider.
 */
export default function ChatPane({
  id,
  content,
  isDark,
  autoFocus,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const initial = React.useMemo(() => {
    try {
      return {
        doc: parseChat(typeof content === "string" ? content : ""),
        error: null as string | null,
      };
    } catch (error) {
      return { doc: emptyChat(), error: (error as Error).message };
    }
    // Mounted per file — `content` only seeds state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [doc, setDoc] = React.useState<ChatDoc>(initial.doc);
  const [parseError, setParseError] = React.useState(initial.error);
  const [draft, setDraft] = React.useState("");
  const [streamingId, setStreamingId] = React.useState<string | null>(null);
  const [models, setModels] = React.useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const composerRef = React.useRef<ChatComposerHandle>(null);
  const [focusOnMount] = React.useState(autoFocus);
  const abortRef = React.useRef<AbortController | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const stickRef = React.useRef(true);
  const docRef = React.useRef(doc);
  docRef.current = doc;

  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => {
    if (!parseError) dispatch(saveContent(id, serializeChat(docRef.current)));
  });
  const update = React.useCallback(
    (fn: (d: ChatDoc) => ChatDoc) => {
      const next = fn(docRef.current);
      docRef.current = next;
      setDoc(next);
      setParseError(null);
      save(serializeChat(next));
    },
    [save],
  );

  // Abort a reply still streaming when the pane goes away.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const { options, keyFiles } = useKeyOptions(doc.provider);
  const promptLibrary = usePromptLibrary();
  const prompts = promptLibrary.prompts;
  const prompt = doc.promptRef
    ? prompts?.find(
        (p) =>
          p.fileId === doc.promptRef!.fileId && p.name === doc.promptRef!.name,
      )
    : undefined;
  const mentionFiles = useMentionFiles();
  // Selections other editors sent here with "Ask AI", waiting to go along.
  const allReferences = useAppSelector((s) => s.ui.chatReferences);
  const references = React.useMemo(
    () => allReferences.filter((r) => r.chatId === id),
    [allReferences, id],
  );
  const selected = doc.keyRef
    ? options?.find(
        (o) => o.fileId === doc.keyRef!.fileId && o.name === doc.keyRef!.name,
      )
    : undefined;
  // Read at send time, like `docRef`, so a reply uses the prompt's latest text.
  const promptRef = React.useRef(prompt);
  promptRef.current = prompt;

  // Pick the first key when none is chosen (or the chosen one is gone).
  React.useEffect(() => {
    if (!options?.length || selected) return;
    const first = options[0];
    update((d) => ({
      ...d,
      keyRef: { fileId: first.fileId, name: first.name },
    }));
  }, [options, selected, update]);

  // Model suggestions for the chosen key.
  const apiKey = selected?.key;
  React.useEffect(() => {
    setModels([]);
    if (!apiKey && doc.provider === "gemini") return;
    const controller = new AbortController();
    setModelsLoading(true);
    listModels(doc.provider, apiKey ?? "", controller.signal)
      .then(setModels)
      .catch(() => {
        // Suggestions only — typing a model id still works.
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false);
      });
    return () => controller.abort();
  }, [doc.provider, apiKey]);

  // Follow the reply as it streams, unless the reader scrolled up.
  React.useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [doc.messages]);

  const run = async (history: ChatMessage[]) => {
    if (!selected) return;
    const reply: ChatMessage = {
      id: newMessageId(),
      role: "assistant",
      content: "",
      at: Date.now(),
      model: docRef.current.model,
    };
    const patchReply = (fn: (m: ChatMessage) => ChatMessage) =>
      update((d) => ({
        ...d,
        messages: d.messages.map((m) => (m.id === reply.id ? fn(m) : m)),
      }));
    update((d) => ({ ...d, messages: [...history, reply] }));
    stickRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingId(reply.id);
    // Thinking models can be silent for a while before the first word, but
    // not forever: abort when nothing arrives for IDLE_TIMEOUT_MS.
    let timedOut = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, IDLE_TIMEOUT_MS);
    };
    arm();
    try {
      await streamChat({
        provider: docRef.current.provider,
        apiKey: selected.key,
        model: docRef.current.model.trim(),
        system: promptRef.current?.text ?? "",
        temperature: docRef.current.temperature,
        messages: history,
        signal: controller.signal,
        onDelta: (text) => {
          arm();
          patchReply((m) => ({ ...m, content: m.content + text }));
        },
      });
      const done = docRef.current.messages.find((m) => m.id === reply.id);
      if (done && !done.content.trim()) {
        patchReply((m) => ({
          ...m,
          error: true,
          content:
            "The model finished without sending any text. Try again or pick another model.",
        }));
      }
    } catch (error) {
      if (timedOut) {
        patchReply((m) => ({
          ...m,
          error: true,
          content:
            (m.content ? `${m.content}\n\n` : "") +
            `No response for ${IDLE_TIMEOUT_MS / 60_000} minutes — stopped waiting.`,
        }));
      } else if (controller.signal.aborted) {
        // Stopped by the user: keep what arrived, drop an empty reply.
        const current = docRef.current.messages.find((m) => m.id === reply.id);
        if (current && !current.content) {
          update((d) => ({
            ...d,
            messages: d.messages.filter((m) => m.id !== reply.id),
          }));
        }
      } else {
        patchReply((m) => ({
          ...m,
          error: true,
          content:
            (m.content ? `${m.content}\n\n` : "") +
            (error instanceof Error ? error.message : String(error)),
        }));
      }
    } finally {
      clearTimeout(idle);
      if (abortRef.current === controller) abortRef.current = null;
      setStreamingId(null);
    }
  };

  const send = async () => {
    // A trailing space (e.g. after an inserted @mention) exports as `&#x20;`.
    const text = draft.replace(/(?:\s|&#x20;|&#32;)+$/, "").trim();
    if (!text || streamingId || !selected || !docRef.current.model.trim())
      return;
    setDraft("");
    composerRef.current?.clear();
    const attachments = [
      ...references.map((r) => ({ path: r.path, content: r.content })),
      ...(await resolveAttachments(text, mentionFiles)),
    ];
    if (references.length) dispatch(uiActions.chatReferencesCleared(id));
    void run([
      ...docRef.current.messages,
      {
        id: newMessageId(),
        role: "user",
        content: text,
        at: Date.now(),
        ...(attachments.length ? { attachments } : {}),
      },
    ]);
  };

  /** Asks again for the last reply (or answers a trailing question). */
  const regenerate = () => {
    if (streamingId) return;
    const messages = [...docRef.current.messages];
    while (
      messages.length &&
      messages[messages.length - 1].role === "assistant"
    ) {
      messages.pop();
    }
    if (messages.length) void run(messages);
  };

  const setProvider = (provider: ChatProvider) =>
    update((d) => ({
      ...d,
      provider,
      keyRef: null,
      model: providerInfo(provider).defaultModel,
    }));

  const last = doc.messages[doc.messages.length - 1];
  const keyFileName = `keys.${providerInfo(doc.provider).extension}`;
  const openKeys = () => {
    const existing = keyFiles[0];
    if (existing) dispatch(openFile(existing.id));
    else dispatch(createAtPath(null, keyFileName, "file"));
  };
  const noKeys = options !== null && !options.length;

  return (
    <>
      <FileBarSlot>
        <ChatSetup
          provider={doc.provider}
          keys={options}
          keyValue={selected}
          model={doc.model}
          models={models}
          modelsLoading={modelsLoading}
          prompts={prompts}
          promptValue={prompt}
          temperature={doc.temperature}
          busy={Boolean(streamingId)}
          onProvider={setProvider}
          onKey={(o) =>
            update((d) => ({
              ...d,
              keyRef: { fileId: o.fileId, name: o.name },
            }))
          }
          onManageKeys={openKeys}
          onModel={(model) => update((d) => ({ ...d, model }))}
          onPrompt={(p) =>
            update((d) => ({
              ...d,
              promptRef: p ? { fileId: p.fileId, name: p.name } : null,
            }))
          }
          onSavePrompt={promptLibrary.save}
          onDeletePrompt={async (p) => {
            await promptLibrary.remove(p);
            if (
              doc.promptRef?.fileId === p.fileId &&
              doc.promptRef.name === p.name
            ) {
              update((d) => ({ ...d, promptRef: null }));
            }
          }}
          onTemperature={(temperature) =>
            update((d) => ({ ...d, temperature }))
          }
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(ui.paneToolbarBtn, "hover:text-app-error w-7 px-0")}
          aria-label="Clear conversation"
          data-testid="chat-pane-clear-button"
          disabled={!doc.messages.length || Boolean(streamingId)}
          onClick={() => update((d) => ({ ...d, messages: [] }))}
        >
          <IconTrash aria-hidden className="pane-icon" />
        </Button>
      </FileBarSlot>

      <div className="chat-pane" data-testid="chat-pane">
        <div
          ref={listRef}
          className="chat-pane__scroll"
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          <div
            className="chat-pane__messages"
            data-testid="chat-pane-message-list"
          >
            {parseError ? (
              <p
                className="chat-pane__notice chat-pane__notice--error"
                role="alert"
                data-testid="chat-pane-parse-error-message"
              >
                <IconAlertTriangle aria-hidden className="pane-icon" />
                This file is not a valid chat ({parseError}). Sending a message
                replaces it.
              </p>
            ) : null}

            {!noKeys && !doc.messages.length ? (
              <div
                className="chat-pane__empty"
                data-testid="chat-pane-empty-message"
              >
                <IconMessageChatbot
                  aria-hidden
                  className="chat-pane__empty-icon"
                />
                <p className="chat-pane__empty-text">
                  Chat with {providerInfo(doc.provider).label} ·{" "}
                  {doc.model || "pick a model"}. The conversation is saved in
                  this file; your key stays in its key file.
                </p>
              </div>
            ) : null}

            {doc.messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                streaming={message.id === streamingId}
                onDelete={
                  streamingId
                    ? undefined
                    : () =>
                        update((d) => ({
                          ...d,
                          messages: d.messages.filter(
                            (m) => m.id !== message.id,
                          ),
                        }))
                }
                onRegenerate={
                  message === last && !streamingId && selected
                    ? regenerate
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        {noKeys ? (
          <div
            className="chat-pane__banner"
            role="status"
            data-testid="chat-pane-no-key-message"
          >
            <span className="chat-pane__banner-text">
              <IconKey aria-hidden className="chat-pane__banner-icon" />
              Add a {providerInfo(doc.provider).label} API key to start chatting
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              data-testid="chat-pane-create-key-button"
              onClick={openKeys}
            >
              {keyFiles.length
                ? `Open ${keyFiles[0].name}`
                : `Create ${keyFileName}`}
            </Button>
          </div>
        ) : null}

        {references.length ? (
          <ul
            className="chat-pane__references"
            aria-label="Selections to send with your next message"
            data-testid="chat-pane-references"
          >
            {references.map((r, i) => (
              <li
                key={`${r.path}-${i}`}
                className="chat-pane__reference"
                title={r.content.slice(0, 500)}
              >
                <IconFileText
                  aria-hidden
                  className="chat-pane__attachment-icon"
                />
                <span className="chat-pane__attachment-path">{r.path}</span>
                <button
                  type="button"
                  className="chat-pane__reference-remove"
                  aria-label={`Remove ${r.path}`}
                  data-testid={`chat-pane-reference-${i}-remove-button`}
                  onClick={() =>
                    dispatch(
                      uiActions.chatReferenceRemoved({ chatId: id, index: i }),
                    )
                  }
                >
                  <IconX aria-hidden className="chat-pane__attachment-icon" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div
          className={cn(
            "chat-pane__composer",
            noKeys && "chat-pane__composer--attached",
          )}
        >
          <ChatComposer
            composerRef={composerRef}
            isDark={isDark}
            disabled={!selected}
            autoFocus={focusOnMount}
            placeholder={
              selected
                ? `Message · @ to reference a file · ${isMac ? "⌘" : "Ctrl"}+Enter to send`
                : "Add an API key to start"
            }
            mentionFiles={mentionFiles}
            onChange={setDraft}
            onSubmit={() => void send()}
          />
          {streamingId ? (
            <Button
              type="button"
              variant="outline"
              data-testid="chat-pane-stop-button"
              onClick={() => abortRef.current?.abort()}
            >
              <IconPlayerStopFilled aria-hidden className="pane-icon" />
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              data-testid="chat-pane-send-button"
              title={`Send (${isMac ? "⌘" : "Ctrl"} + Enter)`}
              disabled={!draft.trim() || !selected || !doc.model.trim()}
              onClick={() => void send()}
            >
              <IconSend2 aria-hidden className="pane-icon" />
              Send
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function MessageRow({
  message,
  streaming,
  onDelete,
  onRegenerate,
}: {
  message: ChatMessage;
  streaming: boolean;
  onDelete?: () => void;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const isUser = message.role === "user";
  const testBase = `chat-pane-message-${message.id}`;
  return (
    <article
      className={cn(
        "chat-pane__message",
        isUser ? "chat-pane__message--user" : "chat-pane__message--assistant",
        message.error && "chat-pane__message--error",
      )}
      aria-label={isUser ? "You" : "Assistant"}
      data-testid={`${testBase}-item`}
    >
      <div className="chat-pane__bubble">
        {message.attachments?.length ? (
          <ul
            className="chat-pane__attachments"
            aria-label="Referenced files"
            data-testid={`${testBase}-attachments`}
          >
            {message.attachments.map((a) => (
              <li key={a.path} className="chat-pane__attachment" title={a.path}>
                <IconFileText
                  aria-hidden
                  className="chat-pane__attachment-icon"
                />
                <span className="chat-pane__attachment-path">{a.path}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {message.error ? (
          <p className="chat-pane__plain">
            <IconAlertTriangle aria-hidden className="chat-pane__error-icon" />
            {message.content}
          </p>
        ) : message.content ? (
          <ChatMarkdown text={message.content} />
        ) : streaming ? (
          <Pending since={message.at} />
        ) : (
          <p className="chat-pane__plain">(empty reply)</p>
        )}
      </div>
      {!streaming ? (
        <div className="chat-pane__tools">
          {message.model ? (
            <span className="chat-pane__meta">{message.model}</span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="chat-pane__tool"
            aria-label="Copy message"
            data-testid={`${testBase}-copy-button`}
            onClick={() =>
              void navigator.clipboard.writeText(message.content).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1000);
              })
            }
          >
            {copied ? (
              <IconCheck aria-hidden className="chat-pane__tool-icon" />
            ) : (
              <IconCopy aria-hidden className="chat-pane__tool-icon" />
            )}
          </Button>
          {onRegenerate ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="chat-pane__tool"
              aria-label={isUser ? "Get a reply" : "Regenerate reply"}
              data-testid={`${testBase}-regenerate-button`}
              onClick={onRegenerate}
            >
              <IconRefresh aria-hidden className="chat-pane__tool-icon" />
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="chat-pane__tool"
              aria-label="Delete message"
              data-testid={`${testBase}-delete-button`}
              onClick={onDelete}
            >
              <IconTrash aria-hidden className="chat-pane__tool-icon" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** "Thinking · 4s" with bouncing dots while a reply has not started. */
function Pending({ since }: { since: number }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span
      className="chat-pane__pending"
      role="status"
      data-testid="chat-pane-pending-message"
    >
      <span className="chat-pane__dot" />
      <span className="chat-pane__dot chat-pane__dot--second" />
      <span className="chat-pane__dot chat-pane__dot--third" />
      <span className="chat-pane__pending-label">
        Thinking{seconds >= 1 ? ` · ${seconds}s` : "…"}
      </span>
    </span>
  );
}
