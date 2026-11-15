import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconLock,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { type EnvEntry, type EnvProblem, parseEnv } from "@/lib/data-formats";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import type { TabMode } from "@/store/tabs-slice";
import type { EditorMarker } from "@/features/editors/CodeEditor";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

const MASK = "••••••••";

/**
 * dotenv files (`.env`, `.env.local`, …). View: variables as a table with
 * values hidden until revealed, plus duplicate-key and syntax warnings. Edit:
 * Monaco with the same warnings underlined.
 */
export default function EnvPane({
  id,
  content,
  mode,
  autoFocus,
  registerSave,
}: PaneProps & { mode: TabMode }) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(
    typeof content === "string" ? content : "",
  );
  const [focusOnMount] = React.useState(autoFocus);
  const [revealAll, setRevealAll] = React.useState(false);
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));

  const { entries, problems } = React.useMemo(() => parseEnv(text), [text]);
  const markers = React.useMemo<EditorMarker[]>(
    () =>
      problems.map((p) => ({
        line: p.line,
        message: p.message,
        severity: p.severity,
      })),
    [problems],
  );

  if (mode === "edit") {
    return (
      <>
        <FileBarSlot>
          <ProblemCount problems={problems} />
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
          onChange={(value) => {
            setText(value);
            save(value);
          }}
        />
      </>
    );
  }

  return (
    <>
      <FileBarSlot>
        <ProblemCount problems={problems} />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          aria-pressed={revealAll}
          data-testid="env-pane-reveal-button"
          onClick={() => setRevealAll((v) => !v)}
        >
          {revealAll ? (
            <IconEyeOff className="size-3.5" />
          ) : (
            <IconEye className="size-3.5" />
          )}
          {revealAll ? "Hide values" : "Show values"}
        </Button>
      </FileBarSlot>
      <div className="bg-app-panel h-full overflow-auto" data-testid="env-pane">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 p-4">
          <p className={cn(ui.help, "flex items-center gap-1.5")}>
            <IconLock className="size-3.5" />
            {entries.length} {entries.length === 1 ? "variable" : "variables"} ·
            stored only in this browser · values are hidden in the PDF export
          </p>
          {problems.length ? <ProblemList problems={problems} /> : null}
          {entries.length ? (
            <EnvTable entries={entries} revealAll={revealAll} />
          ) : (
            <p className={ui.help} data-testid="env-pane-empty-message">
              No variables yet. Switch to Edit and add lines like{" "}
              <code className="font-mono">API_URL=https://example.com</code>.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function ProblemCount({ problems }: { problems: EnvProblem[] }) {
  if (!problems.length) {
    return (
      <span
        className="text-app-success flex items-center gap-1 text-[11px]"
        data-testid="env-pane-status-message"
      >
        <IconCheck className="size-3.5" />
        Valid
      </span>
    );
  }
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

function ProblemList({ problems }: { problems: EnvProblem[] }) {
  return (
    <ul
      className="border-app-border bg-app-bg flex flex-col gap-1 rounded-md border p-2"
      data-testid="env-pane-problem-list"
    >
      {problems.map((p) => (
        <li
          key={`${p.line}:${p.message}`}
          className={cn(
            "flex items-start gap-1.5 text-[12px]",
            p.severity === "error" ? "text-app-error" : "text-app-warn",
          )}
          data-testid={`env-pane-problem-${p.line}-item`}
        >
          <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-mono">Line {p.line}</span> — {p.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EnvTable({
  entries,
  revealAll,
}: {
  entries: EnvEntry[];
  revealAll: boolean;
}) {
  return (
    <div className="border-app-border overflow-hidden rounded-md border">
      <table
        className="w-full border-collapse text-[12px]"
        data-testid="env-pane-table"
      >
        <thead className="bg-app-sidebar">
          <tr>
            <th className="font-title text-app-dim w-[34%] px-3 py-1.5 text-left text-[11px] font-semibold">
              Key
            </th>
            <th className="font-title text-app-dim px-3 py-1.5 text-left text-[11px] font-semibold">
              Value
            </th>
            <th className="w-20" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <EnvRow key={entry.line} entry={entry} revealAll={revealAll} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvRow({ entry, revealAll }: { entry: EnvEntry; revealAll: boolean }) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const show = revealAll || revealed;
  return (
    <tr
      className="group border-app-border hover:bg-app-hover border-t"
      data-testid={`env-pane-row-${entry.key}-${entry.line}`}
    >
      <td className="text-app-bright px-3 py-1.5 align-top font-mono font-semibold">
        {entry.key}
      </td>
      <td className="text-app-text px-3 py-1.5 align-top font-mono break-all">
        {entry.value === "" ? (
          <span className="text-app-dim italic">empty</span>
        ) : show ? (
          <span className="whitespace-pre-wrap">{entry.value}</span>
        ) : (
          <button
            type="button"
            className="text-app-dim hover:text-app-bright inline-flex items-center gap-1"
            title="Hidden value — click to show"
            aria-label={`Show value of ${entry.key}`}
            data-testid={`env-pane-row-${entry.key}-${entry.line}-mask-button`}
            onClick={() => setRevealed(true)}
          >
            <IconEyeOff aria-hidden className="size-3 shrink-0" />
            {MASK}
          </button>
        )}
      </td>
      <td className="px-2 py-1 text-right align-top">
        <div className="flex justify-end gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn("text-app-dim hover:text-app-accent", ui.reveal)}
            aria-label={show ? `Hide ${entry.key}` : `Show ${entry.key}`}
            data-testid={`env-pane-row-${entry.key}-${entry.line}-toggle-button`}
            onClick={() => setRevealed((v) => !v)}
            disabled={revealAll}
          >
            {show ? (
              <IconEyeOff className="size-3.5" />
            ) : (
              <IconEye className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn("text-app-dim hover:text-app-accent", ui.reveal)}
            aria-label={`Copy ${entry.key} value`}
            data-testid={`env-pane-row-${entry.key}-${entry.line}-copy-button`}
            onClick={() =>
              void navigator.clipboard.writeText(entry.value).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1000);
              })
            }
          >
            {copied ? (
              <IconCheck className="size-3.5" />
            ) : (
              <IconCopy className="size-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}
