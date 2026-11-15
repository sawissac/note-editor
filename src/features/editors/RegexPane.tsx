import {
  IconAlertTriangle,
  IconBook2,
  IconBulb,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconWand,
} from "@tabler/icons-react";
import * as React from "react";

import {
  ResizableGroup,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";
import {
  compileRegex,
  explainRegex,
  parseRegexFile,
  REGEX_FLAGS,
  type RegexDoc,
  type RegexMatch,
  type RegexPart,
  type RegexPartKind,
  type RegexRun,
  type RegexTip,
  regexTips,
  serializeRegexFile,
  toggleFlag,
} from "@/lib/regex";
import type { RegexRequest, RegexResponse } from "@/lib/regex-worker";
import RegexWorker from "@/lib/regex-worker?worker";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import type {
  CodeEditorApi,
  EditorDecoration,
  EditorMarker,
} from "@/features/editors/CodeEditor";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import {
  type RegexRecipe,
  REGEX_RECIPES,
} from "@/features/editors/regex-snippets";
import { useDebouncedSave } from "@/features/editors/use-file-content";

/** A run still going after this long is stopped (runaway backtracking). */
const TIMEOUT_MS = 2000;
/** Matches listed in the panel; all kept matches are still highlighted. */
const LIST_LIMIT = 200;

type RunOk = Extract<RegexRun, { ok: true }>;

/** The last finished run, tagged with the input it was for. */
type Finished = {
  pattern: string;
  flags: string;
  text: string;
  outcome: RegexRun | "timeout";
};

/**
 * Runs the pattern over the text in a worker, a moment after the last change.
 * A worker still busy with older input — or one that passes
 * {@link TIMEOUT_MS} — is terminated and replaced, so a pattern that
 * backtracks forever never freezes the page.
 */
function useRegexRun(
  pattern: string,
  flags: string,
  text: string,
  enabled: boolean,
) {
  const [result, setResult] = React.useState<Finished | null>(null);
  const worker = React.useRef<Worker | null>(null);
  const pending = React.useRef<{
    id: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const lastId = React.useRef(0);

  const abort = React.useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    pending.current = null;
    worker.current?.terminate();
    worker.current = null;
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      abort();
      return;
    }
    const debounce = setTimeout(() => {
      abort();
      const id = ++lastId.current;
      const input = { pattern, flags, text };
      const current = (worker.current ??= new RegexWorker());
      const finish = (outcome: Finished["outcome"]) => {
        if (pending.current?.id !== id) return;
        clearTimeout(pending.current.timer);
        pending.current = null;
        setResult({ ...input, outcome });
      };
      current.onmessage = (event: MessageEvent<RegexResponse>) => {
        if (event.data.id === id) finish(event.data.run);
      };
      current.onerror = () => {
        finish({ ok: false, error: "The matcher could not start." });
      };
      const timer = setTimeout(() => {
        if (pending.current?.id !== id) return;
        current.terminate();
        if (worker.current === current) worker.current = null;
        finish("timeout");
      }, TIMEOUT_MS);
      pending.current = { id, timer };
      current.postMessage({ id, ...input } satisfies RegexRequest);
    }, 120);
    return () => clearTimeout(debounce);
  }, [pattern, flags, text, enabled, abort]);

  React.useEffect(
    () => () => {
      abort();
      worker.current?.terminate();
      worker.current = null;
    },
    [abort],
  );

  return enabled ? result : null;
}

/**
 * Regular-expression tester for `.regex` files. Left: the text to test, with
 * every match highlighted. Right, top: the expression — a one-line editor
 * with autocomplete — and its flags. Right, bottom: two collapsible panels.
 * Usage explains the pattern part by part, or lists the matches with their
 * capture groups; Suggestions holds hints with one-click fixes and
 * ready-made patterns.
 */
export default function RegexPane({
  id,
  content,
  autoFocus,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const [doc, setDoc] = React.useState<RegexDoc>(() =>
    parseRegexFile(typeof content === "string" ? content : ""),
  );
  const docRef = React.useRef(doc);
  // The editors are uncontrolled — they are seeded once from the file.
  const [initial] = React.useState(doc);
  const [focusOnMount] = React.useState(autoFocus);
  const [copied, setCopied] = React.useState(false);
  const textApi = React.useRef<CodeEditorApi | null>(null);
  const patternApi = React.useRef<CodeEditorApi | null>(null);

  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () =>
    dispatch(saveContent(id, serializeRegexFile(docRef.current))),
  );
  const update = React.useCallback(
    (patch: Partial<RegexDoc>) => {
      const next = { ...docRef.current, ...patch };
      docRef.current = next;
      setDoc(next);
      save(serializeRegexFile(next));
    },
    [save],
  );

  const { pattern, flags, text } = doc;
  const compiled = React.useMemo(
    () => (pattern ? compileRegex(pattern, flags) : null),
    [pattern, flags],
  );
  const error = compiled && !compiled.ok ? compiled : null;
  const valid = compiled?.ok === true;

  const finished = useRegexRun(pattern, flags, text, valid);
  const run =
    finished && finished.outcome !== "timeout" && finished.outcome.ok
      ? finished.outcome
      : null;
  const timedOut = finished?.outcome === "timeout";
  const failure =
    finished && finished.outcome !== "timeout" && !finished.outcome.ok
      ? finished.outcome.error
      : null;
  // While typing, the shown result is one keystroke behind; hints that depend
  // on the result wait for the run that matches what is on screen.
  const fresh =
    finished !== null &&
    finished.pattern === pattern &&
    finished.flags === flags &&
    finished.text === text;

  const parts = React.useMemo(
    () => (pattern ? explainRegex(pattern, flags) : null),
    [pattern, flags],
  );
  const tips = React.useMemo(
    () =>
      regexTips({
        pattern,
        flags,
        text,
        error: error?.error,
        parts,
        run: fresh && run ? run : undefined,
        timedOut,
      }),
    [pattern, flags, text, error, parts, fresh, run, timedOut],
  );

  const decorations = React.useMemo<EditorDecoration[]>(
    () =>
      (run?.matches ?? [])
        .filter((match) => match.end > match.start)
        .map((match, i) => ({
          start: match.start,
          end: match.end,
          className:
            i % 2
              ? "regex-pane__mark regex-pane__mark--alt"
              : "regex-pane__mark",
        })),
    [run],
  );
  const markers = React.useMemo<EditorMarker[]>(
    () =>
      error ? [{ line: 1, column: error.column, message: error.error }] : [],
    [error],
  );

  /** Sets the pattern through its editor, so the change can be undone there. */
  const apply = (change: { pattern?: string; flags?: string }) => {
    if (change.pattern !== undefined) {
      patternApi.current?.replaceAll(change.pattern);
    }
    if (change.flags) {
      const current = docRef.current.flags;
      const added = [...change.flags].filter((f) => !current.includes(f));
      if (added.length) update({ flags: current + added.join("") });
    }
    patternApi.current?.focus();
  };

  const copy = () => {
    if (!compiled?.ok) return;
    void navigator.clipboard.writeText(compiled.regex.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    });
  };

  const isMac = navigator.platform.toLowerCase().includes("mac");

  return (
    <>
      <FileBarSlot>
        <RegexStatus
          pattern={pattern}
          invalid={Boolean(error) || Boolean(failure)}
          timedOut={timedOut}
          run={run}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          title="Copy as a JavaScript literal, /pattern/flags"
          disabled={!valid}
          data-testid="regex-pane-copy-button"
          onClick={copy}
        >
          {copied ? (
            <IconCheck className="regex-pane__icon" />
          ) : (
            <IconCopy className="regex-pane__icon" />
          )}
          Copy
        </Button>
      </FileBarSlot>
      <ResizableGroup orientation="horizontal" className="regex-pane">
        <ResizablePanel defaultSize="56%" minSize="200px">
          <LazyCodeEditor
            path={`${id}.txt`}
            language="plaintext"
            wordWrap
            aria-label="Text to test"
            data-testid="regex-pane-text-input"
            placeholder="Type or paste the text to test…"
            defaultValue={initial.text}
            decorations={decorations}
            apiRef={textApi}
            onChange={(value) => update({ text: value })}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize="280px">
          <div className="regex-pane__side">
            <section
              className="regex-pane__pattern"
              aria-label="Regular expression"
            >
              <h2 className="regex-pane__heading">Regular expression</h2>
              <div
                className={cn(
                  "regex-pane__field",
                  error && "regex-pane__field--invalid",
                )}
              >
                <span className="regex-pane__slash" aria-hidden>
                  /
                </span>
                <div className="regex-pane__input">
                  <LazyCodeEditor
                    singleLine
                    path={`${id}.regex`}
                    language="regex"
                    aria-label="Regular expression"
                    data-testid="regex-pane-pattern-input"
                    placeholder="pattern"
                    autoFocus={focusOnMount}
                    defaultValue={initial.pattern}
                    markers={markers}
                    apiRef={patternApi}
                    onChange={(value) => update({ pattern: value })}
                  />
                </div>
                <span className="regex-pane__slash" aria-hidden>
                  /{flags}
                </span>
              </div>
              <RegexFlags
                flags={flags}
                onToggle={(flag) =>
                  update({ flags: toggleFlag(docRef.current.flags, flag) })
                }
              />
              {error || failure ? (
                <p
                  className="regex-pane__note regex-pane__note--tone-error"
                  role="alert"
                  data-testid="regex-pane-error-message"
                >
                  <IconAlertTriangle className="regex-pane__icon" />
                  {error?.error ?? failure}
                </p>
              ) : (
                <p className="regex-pane__note">
                  <span>
                    Type <Kbd className="regex-pane__key">\</Kbd>{" "}
                    <Kbd className="regex-pane__key">(</Kbd>{" "}
                    <Kbd className="regex-pane__key">[</Kbd> or{" "}
                    <Kbd className="regex-pane__key">{"{"}</Kbd> for suggestions
                    ·{" "}
                    <Kbd className="regex-pane__key">
                      {isMac ? "⌃S" : "Ctrl+Space"}
                    </Kbd>{" "}
                    lists everything
                  </span>
                </p>
              )}
            </section>
            <div className="regex-pane__insight">
              <RegexUsage
                pattern={pattern}
                parts={parts}
                invalid={Boolean(error)}
                valid={valid && !failure}
                run={run}
                timedOut={timedOut}
                onShowPart={(part) =>
                  patternApi.current?.reveal(part.start, part.end)
                }
                onShowMatch={(match) =>
                  textApi.current?.reveal(match.start, match.end)
                }
              />
              <RegexSuggestions pattern={pattern} tips={tips} onApply={apply} />
            </div>
          </div>
        </ResizablePanel>
      </ResizableGroup>
    </>
  );
}

function countLabel(run: RunOk) {
  return `${run.total.toLocaleString()}${run.capped ? "+" : ""}`;
}

/** File-bar summary: match count, or why there is none. */
function RegexStatus({
  pattern,
  invalid,
  timedOut,
  run,
}: {
  pattern: string;
  invalid: boolean;
  timedOut: boolean;
  run: RunOk | null;
}) {
  let tone: "ok" | "warn" | "error" | null = null;
  let label: string;
  if (!pattern) label = "No pattern";
  else if (invalid) [tone, label] = ["error", "Invalid pattern"];
  else if (timedOut) [tone, label] = ["warn", "Timed out"];
  else if (!run) label = "Matching…";
  else if (run.total === 0) label = "No matches";
  else {
    tone = "ok";
    label = `${countLabel(run)} ${run.total === 1 ? "match" : "matches"}`;
  }
  return (
    <span
      className={cn(
        "regex-pane__status",
        tone === "ok" && "regex-pane__status--tone-ok",
        tone === "warn" && "regex-pane__status--tone-warn",
        tone === "error" && "regex-pane__status--tone-error",
      )}
      data-testid="regex-status-message"
    >
      {tone === "ok" ? (
        <IconCheck className="regex-pane__icon" />
      ) : tone ? (
        <IconAlertTriangle className="regex-pane__icon" />
      ) : null}
      {label}
    </span>
  );
}

/** One toggle per flag; flags it does not list (d, v) are left as they are. */
function RegexFlags({
  flags,
  onToggle,
}: {
  flags: string;
  onToggle: (flag: string) => void;
}) {
  return (
    <div className="regex-pane__flags" role="group" aria-label="Flags">
      {REGEX_FLAGS.map(({ flag, name, detail }) => (
        <Toggle
          key={flag}
          variant="outline"
          size="sm"
          className="regex-pane__flag"
          pressed={flags.includes(flag)}
          title={detail}
          data-testid={`regex-flags-${flag}-button`}
          onPressedChange={() => onToggle(flag)}
        >
          <span className="regex-pane__flag-key">{flag}</span>
          {name}
        </Toggle>
      ))}
    </div>
  );
}

/**
 * A titled, collapsible block of the right column. Open panels share the
 * height left under the expression; a collapsed one is just its title bar.
 */
function RegexPanel({
  id,
  icon,
  title,
  hint,
  badge,
  tools,
  children,
}: {
  /** Names the panel in test ids. */
  id: string;
  icon: React.ReactNode;
  title: string;
  /** One line saying what the panel shows. */
  hint: string;
  badge?: React.ReactNode;
  /** Controls on the right of the title bar, shown while open. */
  tools?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <section
      className={cn(
        "regex-pane__panel",
        !open && "regex-pane__panel--collapsed",
      )}
      aria-label={title}
    >
      <header className="regex-pane__panel-header">
        <button
          type="button"
          className="regex-pane__panel-toggle"
          aria-expanded={open}
          data-testid={`regex-panel-${id}-toggle-button`}
          onClick={() => setOpen((value) => !value)}
        >
          <IconChevronDown
            className={cn(
              "regex-pane__chevron",
              !open && "regex-pane__chevron--closed",
            )}
            aria-hidden
          />
          {icon}
          <span className="regex-pane__panel-title">{title}</span>
          <span className="regex-pane__panel-hint">{hint}</span>
        </button>
        {badge}
        {open ? tools : null}
      </header>
      {open ? <div className="regex-pane__panel-body">{children}</div> : null}
    </section>
  );
}

const PART_TONE: Partial<Record<RegexPartKind, string>> = {
  any: "regex-pane__part-code--kind-set",
  set: "regex-pane__part-code--kind-set",
  class: "regex-pane__part-code--kind-class",
  reference: "regex-pane__part-code--kind-class",
  quantifier: "regex-pane__part-code--kind-quantifier",
  anchor: "regex-pane__part-code--kind-anchor",
  or: "regex-pane__part-code--kind-anchor",
  group: "regex-pane__part-code--kind-group",
  "group-end": "regex-pane__part-code--kind-group",
};

type UsageView = "explain" | "matches";

/**
 * How the pattern is used: "Explain" reads it part by part (a row per part,
 * indented inside groups, click to select that part in the expression);
 * "Matches" lists what it found in the text (click to jump there).
 */
function RegexUsage({
  pattern,
  parts,
  invalid,
  valid,
  run,
  timedOut,
  onShowPart,
  onShowMatch,
}: {
  pattern: string;
  parts: RegexPart[] | null;
  invalid: boolean;
  valid: boolean;
  run: RunOk | null;
  timedOut: boolean;
  onShowPart: (part: RegexPart) => void;
  onShowMatch: (match: RegexMatch) => void;
}) {
  const [view, setView] = React.useState<UsageView>("explain");
  const option = (value: UsageView, label: React.ReactNode) => (
    <ToggleGroupItem
      value={value}
      className="regex-pane__switch-option"
      data-testid={`regex-usage-${value}-button`}
    >
      {label}
    </ToggleGroupItem>
  );

  return (
    <RegexPanel
      id="usage"
      icon={<IconBook2 className="regex-pane__panel-icon" aria-hidden />}
      title="Usage"
      hint={
        view === "explain" ? "what each part does" : "what it found in the text"
      }
      tools={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Show"
          value={view}
          onValueChange={(next) => {
            if (next) setView(next as UsageView);
          }}
        >
          {option("explain", "Explain")}
          {option(
            "matches",
            <>
              Matches
              {run && valid ? (
                <span data-testid="regex-usage-count-message">
                  {countLabel(run)}
                </span>
              ) : null}
            </>,
          )}
        </ToggleGroup>
      }
    >
      {view === "explain" ? (
        <RegexExplain
          pattern={pattern}
          parts={parts}
          invalid={invalid}
          onShow={onShowPart}
        />
      ) : (
        <RegexMatches
          pattern={pattern}
          valid={valid}
          run={run}
          timedOut={timedOut}
          onShow={onShowMatch}
        />
      )}
    </RegexPanel>
  );
}

/** The pattern as a two-column table: the part, and what it matches. */
function RegexExplain({
  pattern,
  parts,
  invalid,
  onShow,
}: {
  pattern: string;
  parts: RegexPart[] | null;
  invalid: boolean;
  onShow: (part: RegexPart) => void;
}) {
  if (!parts?.length) {
    return (
      <p
        className="regex-pane__empty"
        data-testid="regex-explain-empty-message"
      >
        {!pattern
          ? "Type a pattern above. Each part of it is explained here, in order."
          : invalid
            ? "Fix the error above to see the pattern explained."
            : "This pattern uses syntax that cannot be explained here."}
      </p>
    );
  }
  return (
    <>
      <div className="regex-pane__parts-head" aria-hidden>
        <span className="regex-pane__part-key">Part</span>
        <span>What it matches</span>
      </div>
      <ol className="regex-pane__parts" data-testid="regex-explain-list">
        {parts.map((part) => (
          <li key={`${part.start}-${part.end}`}>
            <button
              type="button"
              className="regex-pane__part"
              title="Select this part in the expression"
              data-testid={`regex-explain-row-${part.start}-${part.end}`}
              onClick={() => onShow(part)}
            >
              <span
                className="regex-pane__part-key"
                style={{ paddingLeft: part.depth * 12 }}
              >
                <code
                  className={cn("regex-pane__part-code", PART_TONE[part.kind])}
                >
                  {part.text}
                </code>
              </span>
              <span
                className={cn(
                  "regex-pane__part-text",
                  part.kind === "group-end" && "regex-pane__part-text--muted",
                )}
              >
                {part.description}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Every match with its position and capture groups; click one to jump to it. */
function RegexMatches({
  pattern,
  valid,
  run,
  timedOut,
  onShow,
}: {
  pattern: string;
  valid: boolean;
  run: RunOk | null;
  timedOut: boolean;
  onShow: (match: RegexMatch) => void;
}) {
  let empty: string | null = null;
  if (!pattern) empty = "Matches are listed here once there is a pattern.";
  else if (!valid) empty = "Nothing to run until the pattern is valid.";
  else if (timedOut) {
    empty = `Stopped after ${TIMEOUT_MS / 1000} seconds — see Suggestions.`;
  } else if (!run) empty = "Matching…";
  else if (run.total === 0) empty = "No match in the text.";

  if (empty || !run) {
    return (
      <p
        className="regex-pane__empty"
        data-testid="regex-matches-empty-message"
      >
        {empty ?? "Matching…"}
      </p>
    );
  }
  return (
    <>
      <ol className="regex-pane__matches" data-testid="regex-matches-list">
        {run.matches.slice(0, LIST_LIMIT).map((match, i) => (
          <li key={match.start} className="regex-pane__match-item">
            <button
              type="button"
              className="regex-pane__match"
              title="Show in the text"
              data-testid={`regex-matches-row-${match.start}`}
              onClick={() => onShow(match)}
            >
              <span className="regex-pane__match-index">{i + 1}</span>
              <span
                className={cn(
                  "regex-pane__match-text",
                  !match.text && "regex-pane__match-text--empty",
                )}
              >
                {match.text || "empty match"}
              </span>
              <span className="regex-pane__match-pos">
                Ln {match.line}, Col {match.column}
              </span>
            </button>
            {match.groups.length ? (
              <dl className="regex-pane__groups">
                {match.groups.map((group, gi) => (
                  <div key={gi} className="regex-pane__group">
                    <dt className="regex-pane__group-name">
                      {/^\d+$/.test(group.name)
                        ? `Group ${group.name}`
                        : group.name}
                    </dt>
                    <dd
                      className={cn(
                        "regex-pane__group-value",
                        group.value === null &&
                          "regex-pane__group-value--unset",
                      )}
                    >
                      {group.value ?? "not matched"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ol>
      {run.total > LIST_LIMIT ? (
        <p className="regex-pane__empty">
          Showing the first {LIST_LIMIT} of {countLabel(run)}.
        </p>
      ) : null}
    </>
  );
}

/**
 * Two lists: hints about the pattern as written — each a title, a sentence
 * and, where there is one, a button that applies the fix — then ready-made
 * patterns, shown with their source, that replace the expression on click.
 */
function RegexSuggestions({
  pattern,
  tips,
  onApply,
}: {
  pattern: string;
  tips: RegexTip[];
  onApply: (change: { pattern?: string; flags?: string }) => void;
}) {
  const worst = tips.some((tip) => tip.tone === "error")
    ? "error"
    : tips.some((tip) => tip.tone === "warn")
      ? "warn"
      : "info";
  return (
    <RegexPanel
      id="suggestions"
      icon={<IconBulb className="regex-pane__panel-icon" aria-hidden />}
      title="Suggestions"
      hint="fixes and ready-made patterns"
      badge={
        tips.length ? (
          <span
            className={cn(
              "regex-pane__badge",
              worst === "warn" && "regex-pane__badge--tone-warn",
              worst === "error" && "regex-pane__badge--tone-error",
            )}
            title={`${tips.length} for this pattern`}
            data-testid="regex-suggestions-count-message"
          >
            {tips.length}
          </span>
        ) : null
      }
    >
      <div className="regex-pane__block">
        <h3 className="regex-pane__subheading">For this pattern</h3>
        {tips.length ? (
          <ul className="regex-pane__tips" data-testid="regex-suggestions-list">
            {tips.map((tip) => (
              <li
                key={tip.id}
                className={cn(
                  "regex-pane__tip",
                  tip.tone === "warn" && "regex-pane__tip--tone-warn",
                  tip.tone === "error" && "regex-pane__tip--tone-error",
                )}
                data-testid={`regex-suggestions-${tip.id}-item`}
              >
                {tip.tone === "info" ? (
                  <IconBulb className="regex-pane__tip-icon" aria-hidden />
                ) : (
                  <IconAlertTriangle
                    className="regex-pane__tip-icon"
                    aria-hidden
                  />
                )}
                <div className="regex-pane__tip-body">
                  <p className="regex-pane__tip-title">{tip.title}</p>
                  <p className="regex-pane__tip-text">{tip.text}</p>
                  {tip.code ? (
                    <code className="regex-pane__tip-code">{tip.code}</code>
                  ) : null}
                  {tip.action ? (
                    <Button
                      type="button"
                      size="xs"
                      className="regex-pane__tip-action"
                      data-testid={`regex-suggestions-${tip.id}-button`}
                      onClick={() => tip.action && onApply(tip.action)}
                    >
                      <IconWand className="regex-pane__icon" aria-hidden />
                      {tip.action.label}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : pattern ? (
          <p
            className="regex-pane__clear"
            data-testid="regex-suggestions-empty-message"
          >
            <IconCheck className="regex-pane__icon" aria-hidden />
            Nothing to fix in this pattern.
          </p>
        ) : (
          <p
            className="regex-pane__empty-line"
            data-testid="regex-suggestions-empty-message"
          >
            No pattern yet. Pick one below to start.
          </p>
        )}
      </div>
      <div className="regex-pane__block">
        <h3 className="regex-pane__subheading">
          Ready-made patterns — click one to use it
        </h3>
        <ul className="regex-pane__recipes">
          {REGEX_RECIPES.map((recipe: RegexRecipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                className="regex-pane__recipe"
                title="Replace the expression with this pattern"
                data-testid={`regex-suggestions-recipe-${recipe.id}-button`}
                onClick={() => onApply(recipe)}
              >
                <span className="regex-pane__recipe-name">{recipe.name}</span>
                <code className="regex-pane__recipe-code">
                  {recipe.pattern}
                </code>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </RegexPanel>
  );
}
