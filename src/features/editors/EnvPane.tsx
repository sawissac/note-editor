import { IconAlertTriangle, IconWand } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
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
 * file bar.
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
        <ProblemCount problems={problems} />
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

function ProblemCount({ problems }: { problems: EnvProblem[] }) {
  if (!problems.length) return null;
  const errors = problems.filter((p) => p.severity === "error").length;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[11px]",
        errors ? "text-app-error" : "text-app-warn",
      )}
      data-testid="env-pane-status-message"
    >
      <IconAlertTriangle className="size-3.5" />
      {problems.length} {problems.length === 1 ? "problem" : "problems"}
    </span>
  );
}
