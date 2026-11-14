import * as React from "react";

import { cn } from "@/lib/cn";
import { FileIcon } from "@/lib/file-icons";
import { baseNameLength, KIND_LABEL, kindOf } from "@/lib/file-types";
import * as ui from "@/lib/ui-styles";

/**
 * The inline text field used for both "new item" and "rename" rows.
 *
 * - Enter commits (if valid), Escape cancels.
 * - Blur commits a valid, non-empty value and cancels otherwise, so clicking
 *   away never leaves a half-typed row behind.
 * - On rename the base name is pre-selected, leaving the extension alone.
 * - `validate` runs on every keystroke; its message renders under the field
 *   and blocks commit.
 * - `suggest` (new files) lists complete names to pick from — `hello_world`
 *   offers `hello_world.md`, `.csv`, … ; ↑/↓ move, Enter or click picks,
 *   Tab fills the field without committing.
 */
export function NameInput({
  initialValue = "",
  placeholder,
  validate,
  suggest,
  onCommit,
  onCancel,
  "data-testid": testId,
}: {
  initialValue?: string;
  placeholder?: string;
  validate: (value: string) => string | null;
  suggest?: (value: string) => string[];
  onCommit: (value: string) => boolean;
  onCancel: () => void;
  "data-testid"?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const [value, setValue] = React.useState(initialValue);
  const [touched, setTouched] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const done = React.useRef(false);

  const options = React.useMemo(
    () =>
      (suggest?.(value) ?? []).map((name) => ({ name, error: validate(name) })),
    [suggest, validate, value],
  );
  const firstUsable = options.findIndex((o) => !o.error);
  const activeIndex =
    options[active] && !options[active].error ? active : firstUsable;
  const showList = options.length > 0;
  const error = showList ? null : touched || value ? validate(value) : null;

  React.useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(0, baseNameLength(initialValue));
  }, [initialValue]);

  const finish = (commit: boolean, next = value) => {
    if (done.current) return;
    if (commit) {
      setTouched(true);
      if (validate(next) || !onCommit(next)) return;
    } else {
      onCancel();
    }
    done.current = true;
  };

  const move = (step: 1 | -1) => {
    if (!options.length) return;
    let i = activeIndex;
    for (let n = 0; n < options.length; n++) {
      i = (i + step + options.length) % options.length;
      if (!options[i].error) break;
    }
    setActive(i);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={ref}
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder ?? "Name"}
        aria-invalid={Boolean(error) || undefined}
        role={suggest ? "combobox" : undefined}
        aria-expanded={suggest ? showList : undefined}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={
          showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        aria-autocomplete={suggest ? "list" : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setActive(0);
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (showList && e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (showList && e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (showList && e.key === "Tab" && activeIndex >= 0) {
            e.preventDefault();
            setValue(options[activeIndex].name);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (showList && activeIndex >= 0) {
              finish(true, options[activeIndex].name);
            } else {
              finish(true);
            }
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => {
          if (!value.trim() || validate(value)) finish(false);
          else finish(true);
        }}
        className={cn(
          ui.input,
          "h-6 rounded-sm px-1.5 py-0 text-[12px] leading-6",
          error &&
            "border-app-error focus:border-app-error focus:ring-app-error/20",
        )}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggested names"
          data-testid={testId ? `${testId}-suggestions` : undefined}
          className="absolute top-full right-0 left-0 z-30 mt-0.5 overflow-hidden rounded-md border border-app-border-mid bg-app-panel p-0.5"
        >
          {options.map((option, i) => {
            const dot = option.name.lastIndexOf(".");
            return (
              <li
                key={option.name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                aria-disabled={Boolean(option.error) || undefined}
                data-selected={i === activeIndex || undefined}
                // Keep focus in the input so blur does not cancel the draft.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => !option.error && setActive(i)}
                onClick={() => !option.error && finish(true, option.name)}
                title={option.error ?? undefined}
                className={cn(
                  "flex h-6 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-app-text",
                  "data-selected:bg-app-selected data-selected:text-app-bright",
                  option.error && "cursor-not-allowed opacity-50",
                )}
              >
                <FileIcon name={option.name} className="size-3.5" />
                <span className="min-w-0 truncate">
                  {option.name.slice(0, dot)}
                  <span className="font-semibold text-app-bright">
                    {option.name.slice(dot)}
                  </span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-app-dim">
                  {option.error ? "exists" : KIND_LABEL[kindOf(option.name)]}
                </span>
              </li>
            );
          })}
          <li
            role="presentation"
            className="px-1.5 pt-1 pb-0.5 font-mono text-[10px] text-app-dim"
          >
            ↑↓ choose · Enter create · Tab fill
          </li>
        </ul>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="absolute top-full right-0 left-0 z-30 mt-0.5 rounded-sm border border-app-error/40 bg-app-panel px-1.5 py-1 font-description text-[11px] leading-snug text-app-error"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
