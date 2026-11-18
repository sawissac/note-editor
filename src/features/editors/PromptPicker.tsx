import "@/styles/prompt-picker.css";

import { IconPencil, IconPlus, IconScript } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { PromptChoice, PromptDraft } from "@/features/editors/use-prompts";

type Ref = { fileId: string; name: string };
const same = (a: Ref | null | undefined, b: Ref | null | undefined) =>
  Boolean(a && b && a.fileId === b.fileId && a.name === b.name);

/**
 * The workspace's system prompts as a radio list — "None" first — with a
 * pencil on each row to edit it and a "New prompt" button below.
 *
 * Styles: BEM block `prompt-picker` (`src/styles/prompt-picker.css`).
 *
 * @param props.prompts - Entries of the `.prompt` files; `null` while read.
 * @param props.value - The chosen prompt, if any.
 * @param props.onSelect - A prompt (or `null` for none) was picked.
 * @param props.onEdit - The pencil of a prompt was pressed.
 * @param props.onNew - "New prompt" was pressed.
 * @param props.testIdPrefix - Prefix for the rows' test ids, so two lists
 *   (chat, Ask AI) never share one.
 */
export function PromptList({
  prompts,
  value,
  onSelect,
  onEdit,
  onNew,
  testIdPrefix,
}: {
  prompts: PromptChoice[] | null;
  value: Ref | null | undefined;
  onSelect: (prompt: PromptChoice | null) => void;
  onEdit: (prompt: PromptChoice) => void;
  onNew: () => void;
  testIdPrefix: string;
}) {
  const selected = prompts?.find((p) => same(p, value));
  return (
    <div role="radiogroup" aria-label="System prompt" className="prompt-picker">
      <div className="prompt-picker__row">
        <button
          type="button"
          role="radio"
          aria-checked={!selected}
          className={cn(
            "prompt-picker__choice",
            !selected && "prompt-picker__choice--selected",
          )}
          data-testid={`${testIdPrefix}-prompt-none-item`}
          onClick={() => onSelect(null)}
        >
          <span
            aria-hidden
            className={cn(
              "prompt-picker__radio",
              !selected && "prompt-picker__radio--on",
            )}
          />
          <span className="prompt-picker__name">None</span>
        </button>
      </div>
      {prompts === null ? (
        <span className="prompt-picker__hint">Reading prompts…</span>
      ) : (
        prompts.map((p) => {
          const on = p === selected;
          return (
            <div key={`${p.fileId}/${p.name}`} className="prompt-picker__row">
              <button
                type="button"
                role="radio"
                aria-checked={on}
                title={p.text}
                className={cn(
                  "prompt-picker__choice",
                  on && "prompt-picker__choice--selected",
                )}
                data-testid={`${testIdPrefix}-prompt-${p.fileId}-${p.name}-item`}
                onClick={() => onSelect(p)}
              >
                <span
                  aria-hidden
                  className={cn(
                    "prompt-picker__radio",
                    on && "prompt-picker__radio--on",
                  )}
                />
                <span className="prompt-picker__name">{p.name}</span>
              </button>
              <button
                type="button"
                className="prompt-picker__edit"
                aria-label={`Edit prompt ${p.name}`}
                title="Edit"
                data-testid={`${testIdPrefix}-prompt-${p.fileId}-${p.name}-edit-button`}
                onClick={() => onEdit(p)}
              >
                <IconPencil aria-hidden className="prompt-picker__icon" />
              </button>
            </div>
          );
        })
      )}
      <button
        type="button"
        className="prompt-picker__new"
        data-testid={`${testIdPrefix}-prompt-new-button`}
        onClick={onNew}
      >
        <IconPlus aria-hidden className="prompt-picker__icon" />
        New prompt
      </button>
    </div>
  );
}

/**
 * Form to write a system prompt: name and text, saved into its `.prompt`
 * file. Editing an existing prompt also offers Delete.
 *
 * Styles: BEM block `prompt-editor` (`src/styles/prompt-picker.css`).
 *
 * @param props.prompt - The prompt being edited; `null` for a new one.
 * @param props.onSave - Writes the draft; rejects with a message to show.
 * @param props.onDelete - Removes the edited prompt.
 * @param props.onDone - Leave the form (after saving, deleting or Cancel).
 * @param props.testIdPrefix - Prefix for the form's test ids.
 */
export function PromptEditor({
  prompt,
  onSave,
  onDelete,
  onDone,
  testIdPrefix,
}: {
  prompt: PromptChoice | null;
  onSave: (draft: PromptDraft) => Promise<unknown>;
  onDelete: (prompt: PromptChoice) => Promise<unknown>;
  onDone: () => void;
  testIdPrefix: string;
}) {
  const [name, setName] = React.useState(prompt?.name ?? "");
  const [text, setText] = React.useState(prompt?.text ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form
      className="prompt-editor"
      data-testid={`${testIdPrefix}-prompt-editor`}
      onSubmit={(e) => {
        e.preventDefault();
        void run(() =>
          onSave({
            fileId: prompt?.fileId,
            oldName: prompt?.name,
            name,
            text,
          }),
        );
      }}
    >
      <div className="prompt-editor__head">
        <IconScript aria-hidden className="prompt-editor__icon" />
        <span className="prompt-editor__title">
          {prompt ? "Edit prompt" : "New prompt"}
        </span>
        {prompt ? (
          <span className="prompt-editor__path" title={prompt.path}>
            {prompt.path}
          </span>
        ) : null}
      </div>
      <input
        // A new prompt starts at its name; an edit at the text.
        autoFocus={!prompt}
        className="prompt-editor__name"
        aria-label="Prompt name"
        placeholder="Name, e.g. Reviewer"
        value={name}
        data-testid={`${testIdPrefix}-prompt-name-input`}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        autoFocus={Boolean(prompt)}
        className="prompt-editor__text"
        aria-label="System prompt"
        placeholder="How the assistant should behave…"
        value={text}
        data-testid={`${testIdPrefix}-prompt-text-input`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // ⌘/Ctrl+Enter saves from the text box.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {error ? (
        <p
          role="alert"
          className="prompt-editor__error"
          data-testid={`${testIdPrefix}-prompt-error-message`}
        >
          {error}
        </p>
      ) : null}
      <div className="prompt-editor__actions">
        {prompt ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="prompt-editor__delete"
            disabled={busy}
            data-testid={`${testIdPrefix}-prompt-delete-button`}
            onClick={() => void run(() => onDelete(prompt))}
          >
            Delete
          </Button>
        ) : null}
        <span className="prompt-editor__spacer" />
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={busy}
          data-testid={`${testIdPrefix}-prompt-cancel-button`}
          onClick={onDone}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="xs"
          disabled={busy || !name.trim()}
          data-testid={`${testIdPrefix}-prompt-save-button`}
        >
          Save
        </Button>
      </div>
    </form>
  );
}
