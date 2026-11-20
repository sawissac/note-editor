import "@/styles/env-pane.css";
import { IconAlertTriangle, IconWand } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { type EnvProblem, formatEnv, parseEnv } from "@/lib/data-formats";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import type {
  CodeEditorApi,
  EditorMarker,
} from "@/features/editors/CodeEditor";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

/**
 * dotenv files (`.env`, `.env.local`, …): a Monaco editor with duplicate-key
 * and syntax problems underlined, a problem count and a Format button in the
 * file bar. The count opens the list of problems (Monaco only shows them on
 * hover, which touch screens lack); picking one selects its line.
 *
 * Test ids: `env-pane-source-input`, `env-pane-format-button`,
 * `env-pane-status-message` (the problem count / list trigger),
 * `env-pane-problems-list`, `env-pane-problem-<index>-button`.
 */
export default function EnvPane({
  id,
  content,
  autoFocus,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(
    typeof content === "string" ? content : "",
  );
  const [focusOnMount] = React.useState(autoFocus);
  const apiRef = React.useRef<CodeEditorApi | null>(null);
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));

  const { problems } = React.useMemo(() => parseEnv(text), [text]);
  const markers = React.useMemo<EditorMarker[]>(
    () =>
      problems.map((p) => ({
        line: p.line,
        message: p.message,
        severity: p.severity,
      })),
    [problems],
  );

  return (
    <>
      <FileBarSlot>
        <ProblemCount
          problems={problems}
          onShow={(line) => {
            const [start, end] = lineRange(text, line);
            apiRef.current?.reveal(start, end);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={
            !text.trim() || problems.some((p) => p.severity === "error")
          }
          title="Reformat the whole file"
          data-testid="env-pane-format-button"
          onClick={() => {
            const next = formatEnv(text);
            if (next !== null) apiRef.current?.replaceAll(next);
          }}
        >
          <IconWand className="size-3.5" />
          Format
        </Button>
      </FileBarSlot>
      <LazyCodeEditor
        path={`${id}.env`}
        language="dotenv"
        aria-label="Environment variables source"
        data-testid="env-pane-source-input"
        placeholder="KEY=value"
        autoFocus={focusOnMount}
        defaultValue={text}
        markers={markers}
        apiRef={apiRef}
        onChange={(value) => {
          setText(value);
          save(value);
        }}
      />
    </>
  );
}

/** Offsets of 1-based `line` in `text`, without its line break. */
function lineRange(text: string, line: number): [number, number] {
  const lines = text.split("\n");
  let start = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    start += lines[i].length + 1;
  }
  return [start, start + (lines[line - 1]?.length ?? 0)];
}

/** File-bar problem count; opens the list, a pick selects that line. */
function ProblemCount({
  problems,
  onShow,
}: {
  problems: EnvProblem[];
  onShow: (line: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  // A pick moves focus into the editor; closing must not pull it back.
  const picked = React.useRef(false);
  if (!problems.length) return null;
  const errors = problems.filter((p) => p.severity === "error").length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "env-pane__problems",
            errors
              ? "env-pane__problems--tone-error"
              : "env-pane__problems--tone-warn",
          )}
          title="Show the problems"
          data-testid="env-pane-status-message"
        >
          <IconAlertTriangle className="env-pane__icon" />
          {problems.length} {problems.length === 1 ? "problem" : "problems"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="env-pane__popover"
        onCloseAutoFocus={(event) => {
          if (picked.current) event.preventDefault();
          picked.current = false;
        }}
      >
        <ul className="env-pane__problem-list" data-testid="env-pane-problems-list">
          {problems.map((p, i) => (
            <li key={`${p.line}:${i}`}>
              <button
                type="button"
                className="env-pane__problem"
                data-testid={`env-pane-problem-${i}-button`}
                onClick={() => {
                  picked.current = true;
                  setOpen(false);
                  onShow(p.line);
                }}
              >
                <span className="env-pane__problem-line">L{p.line}</span>
                <span
                  className={cn(
                    "env-pane__problem-message",
                    p.severity === "error" &&
                      "env-pane__problem-message--tone-error",
                  )}
                >
                  {p.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
