import { IconAlertTriangle, IconWand } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  type DataKind,
  formatData,
  parseData,
  type ParseResult,
} from "@/lib/data-formats";
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

const LANGUAGE = { json: "json", yaml: "yaml", toml: "toml" } as const;

/** Re-parse at most this often while typing. */
const PARSE_DELAY = 150;

/**
 * JSON, YAML and TOML files: Monaco with the first parse error underlined
 * and a Format button. Source only — there is no preview mode.
 *
 * @param props.showStatus - Show the syntax-error badge in the file
 *   bar. Default `true`; API-key and `.prompt` files turn it off (Monaco
 *   still underlines JSON errors).
 */
export default function DataPane({
  id,
  content,
  autoFocus,
  registerSave,
  kind,
  showStatus = true,
}: PaneProps & { kind: DataKind; showStatus?: boolean }) {
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

  const parsed = useDeferredParse(kind, text);
  // Monaco's own JSON service already marks JSON errors.
  const markers = React.useMemo<EditorMarker[] | undefined>(
    () => (kind !== "json" && !parsed.ok ? [{ ...parsed.problem }] : undefined),
    [kind, parsed],
  );

  const bar = (
    <FileBarSlot>
      {showStatus ? (
        <ParseStatus result={parsed} testId="data-pane-status-message" />
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={!parsed.ok || !text.trim()}
        title="Reformat the whole file"
        data-testid="data-pane-format-button"
        onClick={() => {
          const next = formatData(kind, text);
          if (next !== null) apiRef.current?.replaceAll(next);
        }}
      >
        <IconWand className="size-3.5" />
        Format
      </Button>
    </FileBarSlot>
  );

  return (
    <>
      {bar}
      <LazyCodeEditor
        path={`${id}.${kind}`}
        language={LANGUAGE[kind]}
        aria-label={`${kind.toUpperCase()} source`}
        data-testid="data-pane-source-input"
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

/** Parses on a short delay so large files stay smooth while typing. */
function useDeferredParse(kind: DataKind, text: string) {
  const [result, setResult] = React.useState<ParseResult>(() =>
    parseData(kind, text),
  );
  React.useEffect(() => {
    const timer = setTimeout(
      () => setResult(parseData(kind, text)),
      PARSE_DELAY,
    );
    return () => clearTimeout(timer);
  }, [kind, text]);
  return result;
}

export function ParseStatus({
  result,
  testId,
}: {
  result: ParseResult;
  testId: string;
}) {
  // Only problems are shown; a file that parses needs no badge.
  return result.ok ? null : (
    <span
      className="text-app-error flex max-w-[22rem] items-center gap-1 truncate text-[11px]"
      title={result.problem.message}
      data-testid={testId}
    >
      <IconAlertTriangle className="size-3.5 shrink-0" />
      <span className="truncate">
        Line {result.problem.line}: {result.problem.message}
      </span>
    </span>
  );
}
