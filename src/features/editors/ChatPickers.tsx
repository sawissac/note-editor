import {
  IconCheck,
  IconChevronDown,
  IconSettings,
  IconSparkles,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { type ChatProvider, PROVIDERS } from "@/lib/chat-doc";
import { cn } from "@/lib/cn";
import { PromptEditor, PromptList } from "@/features/editors/PromptPicker";
import type { PromptChoice, PromptDraft } from "@/features/editors/use-prompts";

export type KeyChoice = { fileId: string; name: string; path: string };
const keyId = (k: { fileId: string; name: string }) => `${k.fileId}/${k.name}`;

/**
 * Everything a chat is set up with, behind one file-bar button that reads
 * `Provider · model`. The popover has two panes — provider, API key and
 * system prompt as radio lists on the left, the searchable model list on the
 * right — over a slim footer with the temperature. Prompts live in `.prompt`
 * files: a prompt's pencil, or "New prompt", swaps the model list for a
 * {@link PromptEditor} that writes the file.
 *
 * Styles: BEM block `chat-setup` (`src/styles/chat-pane.css`).
 *
 * @param props.provider - Current provider.
 * @param props.keys - Keys found for that provider; `null` while reading.
 * @param props.keyValue - The chosen key, if any.
 * @param props.model - Current model id (any id may be typed).
 * @param props.models - Listed model ids, as suggestions.
 * @param props.modelsLoading - The model list is being fetched.
 * @param props.prompts - Entries of the workspace's `.prompt` files; `null`
 *   while reading.
 * @param props.promptValue - The chosen prompt, if any.
 * @param props.temperature - Sampling temperature, 0–2.
 * @param props.busy - A reply is streaming: provider and key are locked.
 * @param props.onProvider - Provider picked.
 * @param props.onKey - Key picked.
 * @param props.onManageKeys - Open (or create) the key file.
 * @param props.onModel - Model picked or typed.
 * @param props.onPrompt - Prompt picked; `null` for none.
 * @param props.onSavePrompt - Writes a prompt draft into its `.prompt` file.
 * @param props.onDeletePrompt - Removes a prompt from its file.
 * @param props.onTemperature - Temperature moved.
 *
 * Test ids: `chat-setup-trigger`, `chat-setup-content`,
 * `chat-setup-provider-<value>-item`, `chat-setup-key-<fileId>-<name>-item`,
 * `chat-setup-manage-keys-button`, `chat-setup-model-search-input`,
 * `chat-setup-model-list`, `chat-setup-model-custom-item`,
 * `chat-setup-temperature-input`; the prompt list and editor use the
 * `chat-setup-prompt-*` ids of {@link PromptList} / {@link PromptEditor}.
 */
export function ChatSetup({
  provider,
  keys,
  keyValue,
  model,
  models,
  modelsLoading,
  prompts,
  promptValue,
  temperature,
  busy,
  onProvider,
  onKey,
  onManageKeys,
  onModel,
  onPrompt,
  onSavePrompt,
  onDeletePrompt,
  onTemperature,
}: {
  provider: ChatProvider;
  keys: KeyChoice[] | null;
  keyValue: { fileId: string; name: string } | undefined;
  model: string;
  models: string[];
  modelsLoading: boolean;
  prompts: PromptChoice[] | null;
  promptValue: { fileId: string; name: string } | undefined;
  temperature: number;
  busy: boolean;
  onProvider: (provider: ChatProvider) => void;
  onKey: (choice: KeyChoice) => void;
  onManageKeys: () => void;
  onModel: (model: string) => void;
  onPrompt: (choice: PromptChoice | null) => void;
  onSavePrompt: (draft: PromptDraft) => Promise<PromptChoice>;
  onDeletePrompt: (prompt: PromptChoice) => Promise<unknown>;
  onTemperature: (temperature: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  // `undefined`: the model list; `null`: a new prompt; else the prompt edited.
  const [editing, setEditing] = React.useState<PromptChoice | null>();
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const typed = query.trim();
  const current = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];
  const key = keys?.find((k) => keyValue && keyId(k) === keyId(keyValue));
  const summary = `${current.label} · ${key?.name ?? "no key"} · ${model || "no model"}`;

  const pickModel = (next: string) => {
    onModel(next);
    setQuery("");
  };

  const radio = (
    selected: boolean,
    label: React.ReactNode,
    onSelect: () => void,
    props: { testId: string; title?: string; disabled?: boolean },
  ) => (
    <button
      key={props.testId}
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={props.disabled}
      title={props.title}
      className={cn(
        "chat-setup__choice",
        selected && "chat-setup__choice--selected",
      )}
      data-testid={props.testId}
      onClick={onSelect}
    >
      <span
        aria-hidden
        className={cn("chat-setup__radio", selected && "chat-setup__radio--on")}
      />
      <span className="chat-setup__choice-text">{label}</span>
    </button>
  );

  const manage = (label: string, testId: string, onClick: () => void) => (
    <button
      type="button"
      className="chat-setup__manage"
      data-testid={testId}
      onClick={() => {
        setOpen(false);
        onClick();
      }}
    >
      <IconSettings aria-hidden className="chat-setup__manage-icon" />
      {label}
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditing(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="chat-setup"
          aria-label={`Chat setup: ${summary}`}
          title={summary}
          data-testid="chat-setup-trigger"
        >
          <IconSparkles aria-hidden className="chat-setup__icon" />
          <span className="chat-setup__value">{current.label}</span>
          <span aria-hidden className="chat-setup__dot">
            ·
          </span>
          <span className="chat-setup__value chat-setup__value--mono">
            {model || "Pick a model"}
          </span>
          <IconChevronDown aria-hidden className="chat-setup__chevron" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="chat-setup__panel"
        data-testid="chat-setup-content"
        // Land in the model search, the thing most often changed.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="chat-setup__body">
          <div className="chat-setup__nav">
            <div
              role="radiogroup"
              aria-label="Provider"
              className="chat-setup__group"
            >
              <span className="chat-setup__heading">Provider</span>
              {PROVIDERS.map((p) =>
                radio(
                  p.value === provider,
                  p.label,
                  () => p.value !== provider && onProvider(p.value),
                  {
                    testId: `chat-setup-provider-${p.value}-item`,
                    disabled: busy,
                  },
                ),
              )}
            </div>
            <div
              role="radiogroup"
              aria-label="API key"
              className="chat-setup__group"
            >
              <span className="chat-setup__heading">Key</span>
              {keys === null ? (
                <span className="chat-setup__hint">Reading keys…</span>
              ) : keys.length ? (
                keys.map((k) =>
                  radio(k === key, k.name, () => onKey(k), {
                    testId: `chat-setup-key-${k.fileId}-${k.name}-item`,
                    title: k.path,
                    disabled: busy,
                  }),
                )
              ) : (
                <span className="chat-setup__hint">No keys yet</span>
              )}
              {manage(
                keys?.length ? "Manage keys" : "Add a key",
                "chat-setup-manage-keys-button",
                onManageKeys,
              )}
            </div>
            <div className="chat-setup__group">
              <span className="chat-setup__heading">Prompt</span>
              <PromptList
                prompts={prompts}
                value={promptValue}
                testIdPrefix="chat-setup"
                onSelect={onPrompt}
                onEdit={setEditing}
                onNew={() => setEditing(null)}
              />
            </div>
          </div>

          {editing !== undefined ? (
            <PromptEditor
              key={editing ? keyId(editing) : "new"}
              prompt={editing}
              testIdPrefix="chat-setup"
              onSave={async (draft) => {
                const saved = await onSavePrompt(draft);
                // A new prompt is the one to use; a renamed chosen one stays.
                if (
                  !editing ||
                  (promptValue && keyId(editing) === keyId(promptValue))
                ) {
                  onPrompt(saved);
                }
              }}
              onDelete={onDeletePrompt}
              onDone={() => setEditing(undefined)}
            />
          ) : (
            <Command className="chat-setup__models">
              <CommandInput
                ref={searchRef}
                value={query}
                onValueChange={setQuery}
                placeholder="Search or type a model id…"
                data-testid="chat-setup-model-search-input"
              />
              <CommandList
                className="chat-setup__list"
                data-testid="chat-setup-model-list"
              >
                <CommandEmpty className="chat-setup__empty">
                  {modelsLoading
                    ? "Loading models…"
                    : "No listed model matches."}
                </CommandEmpty>
                {models.length ? (
                  <CommandGroup className="chat-setup__options">
                    {models.map((m) => (
                      <CommandItem
                        key={m}
                        value={m}
                        className="chat-setup__option"
                        onSelect={() => pickModel(m)}
                      >
                        <span className="chat-setup__option-text">{m}</span>
                        {m === model ? (
                          <IconCheck
                            aria-hidden
                            className="chat-setup__check"
                          />
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {typed && !models.includes(typed) ? (
                  <CommandGroup className="chat-setup__options">
                    <CommandItem
                      value={`__custom__${typed}`}
                      className="chat-setup__option"
                      data-testid="chat-setup-model-custom-item"
                      onSelect={() => pickModel(typed)}
                    >
                      Use “{typed}”
                    </CommandItem>
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>
          )}
        </div>

        <div className="chat-setup__footer">
          <div className="chat-setup__field">
            <span className="chat-setup__field-label">Temp</span>
            <Slider
              size="sm"
              aria-label="Temperature"
              className="chat-setup__slider"
              data-testid="chat-setup-temperature-input"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onValueChange={onTemperature}
            />
            <span className="chat-setup__readout">
              {temperature.toFixed(1)}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
