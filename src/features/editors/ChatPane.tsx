import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconKey,
  IconMessageChatbot,
  IconPlayerStopFilled,
  IconRefresh,
  IconSend2,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import * as React from "react";

import { parseApiKeys } from "@/lib/api-keys";
import {
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
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";
import { extensionOf, kindOf } from "@/lib/file-types";
import { storage } from "@/lib/storage";
import { createAtPath, openFile, saveContent } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { getPath } from "@/store/selectors";
import {
  ChatComposer,
  type ChatComposerHandle,
} from "@/features/editors/ChatComposer";
import { ChatMarkdown } from "@/features/editors/ChatMarkdown";
import {
  KeyPicker,
  ModelPicker,
  ProviderPicker,
} from "@/features/editors/ChatPickers";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

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

/** Keys for `provider` found in the workspace's key files. */
function useKeyOptions(provider: ChatProvider) {
  const nodes = useAppSelector((s) => s.fs.nodes);
  const extension = providerInfo(provider).extension;
  const files = React.useMemo(
    () =>
      Object.values(nodes).filter(
        (n) =>
          n.type === "file" &&
          kindOf(n.name) === "apikeys" &&
          extensionOf(n.name) === extension,
      ),
    [nodes, extension],
  );
  const [options, setOptions] = React.useState<KeyOption[] | null>(null);
  React.useEffect(() => {
    let live = true;
    void Promise.all(
      files.map(async (file) => {
        const text = await storage.getContent(file.id).catch(() => null);
        const { entries } = parseApiKeys(typeof text === "string" ? text : "");
        const path = getPath(nodes, file.id).join("/");
        return entries
          .filter((e) => e.key.trim())
          .map((e) => ({ fileId: file.id, path, name: e.name, key: e.key }));
      }),
    ).then((lists) => live && setOptions(lists.flat()));
    return () => {
      live = false;
    };
    // `nodes` only feeds the path labels; `files` changes with it anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);
  return { options, keyFiles: files };
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
  const [showSettings, setShowSettings] = React.useState(false);
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
  const selected = doc.keyRef
    ? options?.find(
        (o) => o.fileId === doc.keyRef!.fileId && o.name === doc.keyRef!.name,
      )
    : undefined;

  // Pick the first key when none is chosen (or the chosen one is gone).
  React.useEffect(() => {
    if (!options?.length || selected) return;
    const first = options[0];
    update((d) => ({ ...d, keyRef: { fileId: first.fileId, name: first.name } }));
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
        system: docRef.current.system,
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
          content: "The model finished without sending any text. Try again or pick another model.",
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

  const send = () => {
    const text = draft.trim();
    if (!text || streamingId || !selected || !docRef.current.model.trim()) return;
    setDraft("");
    composerRef.current?.clear();
    void run([
      ...docRef.current.messages,
      { id: newMessageId(), role: "user", content: text, at: Date.now() },
    ]);
  };

  /** Asks again for the last reply (or answers a trailing question). */
  const regenerate = () => {
    if (streamingId) return;
    const messages = [...docRef.current.messages];
    while (messages.length && messages[messages.length - 1].role === "assistant") {
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
        <ProviderPicker
          value={doc.provider}
          disabled={Boolean(streamingId)}
          onChange={setProvider}
        />
        <KeyPicker
          options={options ?? []}
          value={selected}
          disabled={options === null || Boolean(streamingId)}
          onChange={(o) =>
            update((d) => ({ ...d, keyRef: { fileId: o.fileId, name: o.name } }))
          }
          onManage={openKeys}
        />
        <ModelPicker
          value={doc.model}
          models={models}
          loading={modelsLoading}
          onChange={(model) => update((d) => ({ ...d, model }))}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(ui.paneToolbarBtn, "w-7 px-0")}
          data-active={showSettings || undefined}
          aria-label="Chat settings"
          aria-pressed={showSettings}
          data-testid="chat-pane-settings-button"
          onClick={() => setShowSettings((v) => !v)}
        >
          <IconAdjustmentsHorizontal aria-hidden className="pane-icon" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(ui.paneToolbarBtn, "w-7 px-0 hover:text-app-error")}
          aria-label="Clear conversation"
          data-testid="chat-pane-clear-button"
          disabled={!doc.messages.length || Boolean(streamingId)}
          onClick={() => update((d) => ({ ...d, messages: [] }))}
        >
          <IconTrash aria-hidden className="pane-icon" />
        </Button>
      </FileBarSlot>

      <div className="chat-pane" data-testid="chat-pane">
        {showSettings ? (
          <div className="chat-pane__settings" data-testid="chat-pane-settings-content">
            <label className="pane-field">
              <span className="pane-field__label">System prompt</span>
              <textarea
                className="pane-field__textarea"
                data-testid="chat-pane-system-input"
                rows={3}
                value={doc.system}
                placeholder="How the assistant should behave (optional)"
                onChange={(e) => update((d) => ({ ...d, system: e.target.value }))}
              />
            </label>
            <Slider
              size="sm"
              label="Temperature"
              data-testid="chat-pane-temperature-input"
              min={0}
              max={2}
              step={0.1}
              value={doc.temperature}
              formatValue={(current) => current.toFixed(1)}
              onValueChange={(temperature) =>
                update((d) => ({ ...d, temperature }))
              }
            />
          </div>
        ) : null}

        <div
          ref={listRef}
          className="chat-pane__scroll"
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          <div className="chat-pane__messages" data-testid="chat-pane-message-list">
            {parseError ? (
              <p className="chat-pane__notice chat-pane__notice--error" role="alert" data-testid="chat-pane-parse-error-message">
                <IconAlertTriangle aria-hidden className="pane-icon" />
                This file is not a valid chat ({parseError}). Sending a message
                replaces it.
              </p>
            ) : null}

            {!noKeys && !doc.messages.length ? (
              <div className="chat-pane__empty" data-testid="chat-pane-empty-message">
                <IconMessageChatbot aria-hidden className="chat-pane__empty-icon" />
                <p className="chat-pane__empty-text">
                  Chat with {providerInfo(doc.provider).label} · {doc.model || "pick a model"}.
                  The conversation is saved in this file; your key stays in its
                  key file.
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
                          messages: d.messages.filter((m) => m.id !== message.id),
                        }))
                }
                onRegenerate={
                  message === last && !streamingId && selected ? regenerate : undefined
                }
              />
            ))}
          </div>
        </div>

        {noKeys ? (
          <div className="chat-pane__banner" role="status" data-testid="chat-pane-no-key-message">
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
              {keyFiles.length ? `Open ${keyFiles[0].name}` : `Create ${keyFileName}`}
            </Button>
          </div>
        ) : null}

        <div className={cn("chat-pane__composer", noKeys && "chat-pane__composer--attached")}>
          <ChatComposer
            composerRef={composerRef}
            isDark={isDark}
            disabled={!selected}
            autoFocus={focusOnMount}
            placeholder={
              selected
                ? "Message"
                : "Add an API key to start"
            }
            onChange={setDraft}
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
              disabled={!draft.trim() || !selected || !doc.model.trim()}
              onClick={send}
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
      <span className="chat-pane__avatar" aria-hidden>
        {isUser ? (
          <IconUser className="chat-pane__avatar-icon" />
        ) : message.error ? (
          <IconAlertTriangle className="chat-pane__avatar-icon" />
        ) : (
          <IconMessageChatbot className="chat-pane__avatar-icon" />
        )}
      </span>
      <div className="chat-pane__bubble">
        {message.error ? (
          <p className="chat-pane__plain">{message.content}</p>
        ) : message.content ? (
          <ChatMarkdown text={message.content} />
        ) : streaming ? (
          <Pending since={message.at} />
        ) : (
          <p className="chat-pane__plain">(empty reply)</p>
        )}
        {!streaming ? (
          <div className="chat-pane__tools">
            {message.model ? <span className="chat-pane__meta">{message.model}</span> : null}
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
      </div>
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
