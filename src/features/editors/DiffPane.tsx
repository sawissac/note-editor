import "@/styles/diff-pane.css";
import {
  type FileDiffMetadata,
  parseDiffFromFile,
  parsePatchFiles,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import {
  IconArrowsLeftRight,
  IconCheck,
  IconColumns2,
  IconCopy,
  IconFileDownload,
  IconGitCompare,
  IconLayoutRows,
  IconPencil,
  IconSpace,
  IconX,
} from "@tabler/icons-react";
import { Search } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";
import {
  compareExtension,
  comparisonPatch,
  countLineChanges,
  type DiffComparison,
  type DiffLayout,
  diffLanguage,
  isComparable,
  parseDiffFile,
  serializeComparison,
} from "@/lib/diff-doc";
import { baseNameLength } from "@/lib/file-types";
import { FileIcon } from "@/lib/file-icons";
import { BREAKPOINT, useMediaQuery } from "@/lib/use-media-query";
import { downloadFile, storage } from "@/lib/storage";
import { openFile, saveContent } from "@/store/actions";
import type { FsNode } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector } from "@/store";
import { getPath } from "@/store/selectors";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { DiffLinesSkeleton } from "@/features/editors/PaneSkeleton";

type Side = "left" | "right";

const SIDE_LABEL: Record<Side, string> = {
  left: "Original",
  right: "Changed",
};

/** BEM modifier per side — named for the role, not the position. */
const SIDE_MOD: Record<Side, string> = {
  left: "original",
  right: "changed",
};

const other = (side: Side): Side => (side === "left" ? "right" : "left");

/**
 * Split needs about two 380px columns; below `md` (phones, iPad split-view)
 * the diff shows unified whatever the saved layout says.
 */
function useShownLayout(layout: DiffLayout) {
  const wide = useMediaQuery(BREAKPOINT.md);
  return { shown: wide ? layout : ("unified" as const), narrow: !wide };
}

/** Files larger than this get no change count in the picker. */
const COUNT_LIMIT = 200_000;

/**
 * Editor for `.diff` files. A comparison file first asks for two workspace
 * files sharing one extension, then shows them as a GitHub-style diff —
 * original on the left, changed on the right — re-read whenever either file
 * is saved. An imported patch (`git diff` output) renders read-only.
 *
 * Test ids: `diff-pane-picker`, `diff-pane-search-input`,
 * `diff-pane-option-<fileId>`, `diff-pane-<side>-slot-button`,
 * `diff-pane-<side>-clear-button`, `diff-pane-picker-swap-button`,
 * `diff-pane-compare-button`, `diff-pane-cancel-button`,
 * `diff-pane-missing-message`, `diff-pane-view`,
 * `diff-pane-identical-message`, `diff-pane-stats`,
 * `diff-pane-layout-<layout>-button`, `diff-pane-whitespace-button`,
 * `diff-pane-copy-button`, `diff-pane-download-button`,
 * `diff-pane-swap-button`, `diff-pane-change-button`,
 * `diff-pane-open-<side>-button`.
 */
export default function DiffPane({
  id,
  name,
  content,
  isDark,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const [file] = React.useState(() =>
    parseDiffFile(typeof content === "string" ? content : ""),
  );
  const [doc, setDoc] = React.useState<DiffComparison | null>(
    file.type === "comparison" ? file.doc : null,
  );
  const [patchLayout, setPatchLayout] = React.useState<DiffLayout>("split");

  const persist = React.useCallback(
    (next: DiffComparison) => {
      setDoc(next);
      void dispatch(saveContent(id, serializeComparison(next)));
    },
    [dispatch, id],
  );
  useSaveHandler(registerSave, () => {
    if (doc) return dispatch(saveContent(id, serializeComparison(doc)));
  });

  if (file.type === "patch") {
    return (
      <PatchView
        patch={file.patch}
        layout={patchLayout}
        onLayout={setPatchLayout}
        isDark={isDark}
      />
    );
  }
  return (
    <ComparisonView name={name} doc={doc!} onChange={persist} isDark={isDark} />
  );
}

/* ───────────────────────────── Comparison ───────────────────────────── */

function ComparisonView({
  name,
  doc,
  onChange,
  isDark,
}: {
  name: string;
  doc: DiffComparison;
  onChange: (doc: DiffComparison) => void;
  isDark: boolean;
}) {
  const nodes = useAppSelector((s) => s.fs.nodes);
  const left = doc.left ? nodes[doc.left] : undefined;
  const right = doc.right ? nodes[doc.right] : undefined;
  const [picking, setPicking] = React.useState(false);
  // A side whose file was deleted since the comparison was saved.
  const missing = Boolean((doc.left && !left) || (doc.right && !right));

  if (picking || !left || !right) {
    return (
      <DiffPicker
        initialLeft={left?.id ?? null}
        initialRight={right?.id ?? null}
        ignoreWhitespace={doc.ignoreWhitespace}
        missing={missing}
        onCancel={left && right ? () => setPicking(false) : undefined}
        onCompare={(l, r) => {
          setPicking(false);
          onChange({ ...doc, left: l, right: r });
        }}
      />
    );
  }
  return (
    <PairDiff
      name={name}
      left={left}
      right={right}
      doc={doc}
      isDark={isDark}
      onChange={onChange}
      onChangeFiles={() => setPicking(true)}
    />
  );
}

type Loaded =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready";
      fileDiff: FileDiffMetadata;
      leftText: string;
      rightText: string;
    };

function PairDiff({
  name,
  left,
  right,
  doc,
  isDark,
  onChange,
  onChangeFiles,
}: {
  name: string;
  left: FsNode;
  right: FsNode;
  doc: DiffComparison;
  isDark: boolean;
  onChange: (doc: DiffComparison) => void;
  onChangeFiles: () => void;
}) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const [loaded, setLoaded] = React.useState<Loaded>({ status: "loading" });
  const [copied, setCopied] = React.useState(false);
  const { layout, ignoreWhitespace } = doc;
  const { shown, narrow } = useShownLayout(layout);
  const leftPath = getPath(nodes, left.id).join("/");
  const rightPath = getPath(nodes, right.id).join("/");

  // `updatedAt` moves on every save, so edits in another tab show up here.
  React.useEffect(() => {
    let live = true;
    Promise.all([storage.getContent(left.id), storage.getContent(right.id)])
      .then(([a, b]) => {
        if (!live) return;
        const leftText = typeof a === "string" ? a : "";
        const rightText = typeof b === "string" ? b : "";
        const fileDiff = parseDiffFromFile(
          {
            name: left.name,
            contents: leftText,
            lang: diffLanguage(left.name),
            cacheKey: `${left.id}:${left.updatedAt}`,
          },
          {
            name: right.name,
            contents: rightText,
            lang: diffLanguage(right.name),
            cacheKey: `${right.id}:${right.updatedAt}`,
          },
          { ignoreWhitespace },
        );
        setLoaded({ status: "ready", fileDiff, leftText, rightText });
      })
      .catch((error: unknown) => {
        if (live) setLoaded({ status: "error", error: String(error) });
      });
    return () => {
      live = false;
    };
  }, [
    left.id,
    left.name,
    left.updatedAt,
    right.id,
    right.name,
    right.updatedAt,
    ignoreWhitespace,
  ]);

  const patch = () =>
    loaded.status === "ready"
      ? comparisonPatch(
          leftPath,
          rightPath,
          loaded.leftText,
          loaded.rightText,
          ignoreWhitespace,
        )
      : "";
  const copy = async () => {
    await navigator.clipboard.writeText(patch());
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const download = () =>
    downloadFile(
      `${name.slice(0, baseNameLength(name))}.patch`,
      patch(),
      "text/x-diff",
    );

  const stats =
    loaded.status === "ready" ? countChanges([loaded.fileDiff]) : null;
  const ready = loaded.status === "ready";
  const sides: Array<[Side, FsNode, string, number | undefined]> = [
    ["left", left, leftPath, stats?.deletions],
    ["right", right, rightPath, stats?.additions],
  ];

  return (
    <div className="diff-pane">
      <FileBarSlot>
        {stats ? <DiffStats {...stats} /> : null}
        <LayoutSwitch
          layout={shown}
          narrow={narrow}
          onLayout={(next) => onChange({ ...doc, layout: next })}
        />
        <ButtonGroup aria-label="Diff">
          <BarButton
            label={
              ignoreWhitespace
                ? "Whitespace ignored — show whitespace changes"
                : "Hide whitespace-only changes"
            }
            pressed={ignoreWhitespace}
            testId="diff-pane-whitespace-button"
            onClick={() =>
              onChange({ ...doc, ignoreWhitespace: !ignoreWhitespace })
            }
          >
            <IconSpace className="diff-pane__icon" />
          </BarButton>
          <BarButton
            label="Copy as a unified patch"
            disabled={!ready}
            testId="diff-pane-copy-button"
            onClick={() => void copy()}
          >
            {copied ? (
              <IconCheck className="diff-pane__icon diff-pane__icon--done" />
            ) : (
              <IconCopy className="diff-pane__icon" />
            )}
          </BarButton>
          <BarButton
            label="Download as a .patch file"
            disabled={!ready}
            testId="diff-pane-download-button"
            onClick={download}
          >
            <IconFileDownload className="diff-pane__icon" />
          </BarButton>
          <BarButton
            label="Swap original and changed"
            testId="diff-pane-swap-button"
            onClick={() => onChange({ ...doc, left: right.id, right: left.id })}
          >
            <IconArrowsLeftRight className="diff-pane__icon" />
          </BarButton>
          <BarButton
            label="Pick other files"
            testId="diff-pane-change-button"
            onClick={onChangeFiles}
          >
            <IconPencil className="diff-pane__icon" />
          </BarButton>
        </ButtonGroup>
      </FileBarSlot>

      <div className="diff-pane__heads">
        {sides.map(([side, node, path, count]) => (
          <div key={side} className="diff-pane__head">
            <span
              className={cn(
                "diff-pane__head-label",
                `diff-pane__head-label--${SIDE_MOD[side]}`,
              )}
            >
              {SIDE_LABEL[side]}
            </span>
            <button
              type="button"
              className="diff-pane__head-file"
              title={`Open ${path}`}
              data-testid={`diff-pane-open-${side}-button`}
              onClick={() => dispatch(openFile(node.id))}
            >
              <FileIcon name={node.name} className="diff-pane__head-icon" />
              <span className="diff-pane__head-path">{path}</span>
            </button>
            {count !== undefined ? (
              <span
                className={cn(
                  "diff-pane__count",
                  side === "left"
                    ? "diff-pane__count--deleted"
                    : "diff-pane__count--added",
                )}
              >
                {side === "left" ? "−" : "+"}
                {count}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="diff-pane__body" data-testid="diff-pane-view">
        {loaded.status === "loading" ? (
          <DiffLinesSkeleton />
        ) : loaded.status === "error" ? (
          <p className="diff-pane__message diff-pane__message--tone-error">
            Could not read the files: {loaded.error}
          </p>
        ) : loaded.fileDiff.hunks.length === 0 ? (
          <p
            className="diff-pane__message"
            data-testid="diff-pane-identical-message"
          >
            {ignoreWhitespace
              ? "No differences apart from whitespace."
              : "No differences — both files have the same content."}
          </p>
        ) : (
          <FileDiff
            fileDiff={loaded.fileDiff}
            className="diff-pane__diff"
            options={diffOptions(shown, isDark, true)}
          />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Picker ───────────────────────────── */

type Candidate = { node: FsNode; path: string; ext: string };

/**
 * One card: two slots (Original ⇄ Changed) over a single file list. Clicking
 * a file fills the highlighted slot, then highlights the empty one; clicking
 * a picked file takes it back out. Once a file is in, the list narrows to its
 * extension and each row shows how many lines would change.
 */
function DiffPicker({
  initialLeft,
  initialRight,
  ignoreWhitespace,
  missing,
  onCancel,
  onCompare,
}: {
  initialLeft: string | null;
  initialRight: string | null;
  ignoreWhitespace: boolean;
  missing: boolean;
  onCancel?: () => void;
  onCompare: (left: string, right: string) => void;
}) {
  const nodes = useAppSelector((s) => s.fs.nodes);
  const [picked, setPicked] = React.useState<Record<Side, string | null>>({
    left: initialLeft,
    right: initialRight,
  });
  const [active, setActive] = React.useState<Side>(
    initialLeft && !initialRight ? "right" : "left",
  );
  const [query, setQuery] = React.useState("");

  const files = React.useMemo<Candidate[]>(
    () =>
      Object.values(nodes)
        .filter((n) => n.type === "file" && isComparable(n.name))
        .map((node) => ({
          node,
          path: getPath(nodes, node.id).join("/"),
          ext: compareExtension(node.name),
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [nodes],
  );

  const anchorId = picked.left ?? picked.right;
  const anchor = anchorId ? nodes[anchorId] : undefined;
  const ext = anchor ? compareExtension(anchor.name) : null;
  const needle = query.trim().toLowerCase();
  const shown = files.filter(
    (f) =>
      (ext === null || f.ext === ext) &&
      (!needle || f.path.toLowerCase().includes(needle)),
  );
  const counts = useLineCounts(
    anchor ?? null,
    picked.left ? "left" : "right",
    shown,
    ignoreWhitespace,
  );

  const choose = (fileId: string) => {
    const owner: Side | null =
      picked.left === fileId
        ? "left"
        : picked.right === fileId
          ? "right"
          : null;
    if (owner) {
      setPicked((prev) => ({ ...prev, [owner]: null }));
      setActive(owner);
      return;
    }
    const next = { ...picked, [active]: fileId };
    setPicked(next);
    if (!next[other(active)]) setActive(other(active));
  };
  const clear = (side: Side) => {
    setPicked((prev) => ({ ...prev, [side]: null }));
    setActive(side);
  };

  const ready = Boolean(picked.left && picked.right);
  const compare = () => ready && onCompare(picked.left!, picked.right!);

  return (
    <div className="diff-picker" data-testid="diff-pane-picker">
      <div className="diff-picker__card">
        <header className="diff-picker__head">
          <IconGitCompare aria-hidden className="diff-picker__head-icon" />
          <h2 className="diff-picker__title">Compare files</h2>
          {ext !== null ? (
            <span
              className="diff-picker__filter"
              title="Both files must share this extension"
            >
              .{ext || "no extension"} only
            </span>
          ) : null}
        </header>

        {missing ? (
          <p
            className="diff-picker__notice"
            data-testid="diff-pane-missing-message"
          >
            A file in this comparison was deleted — pick a replacement.
          </p>
        ) : null}

        <div className="diff-picker__slots">
          {(["left", "right"] as const).map((side, i) => {
            const node = picked[side] ? nodes[picked[side]] : undefined;
            return (
              <React.Fragment key={side}>
                {i === 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="diff-picker__swap"
                    title="Swap original and changed"
                    aria-label="Swap original and changed"
                    disabled={!picked.left && !picked.right}
                    data-testid="diff-pane-picker-swap-button"
                    onClick={() => {
                      setPicked((p) => ({ left: p.right, right: p.left }));
                      setActive(other(active));
                    }}
                  >
                    <IconArrowsLeftRight className="diff-picker__icon" />
                  </Button>
                ) : null}
                <div
                  className={cn(
                    "diff-picker__slot",
                    active === side && "diff-picker__slot--active",
                  )}
                >
                  <button
                    type="button"
                    className="diff-picker__slot-main"
                    aria-pressed={active === side}
                    title={`Fill the ${SIDE_LABEL[side].toLowerCase()} slot`}
                    data-testid={`diff-pane-${side}-slot-button`}
                    onClick={() => setActive(side)}
                  >
                    <span
                      className={cn(
                        "diff-picker__slot-label",
                        `diff-picker__slot-label--${SIDE_MOD[side]}`,
                      )}
                    >
                      {SIDE_LABEL[side]}
                    </span>
                    {node ? (
                      <span className="diff-picker__slot-file">
                        <FileIcon name={node.name} />
                        <span className="diff-picker__slot-name">
                          {node.name}
                        </span>
                      </span>
                    ) : (
                      <span className="diff-picker__slot-empty">
                        Pick a file below
                      </span>
                    )}
                  </button>
                  {node ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="diff-picker__slot-clear"
                      aria-label={`Clear the ${SIDE_LABEL[side].toLowerCase()} file`}
                      data-testid={`diff-pane-${side}-clear-button`}
                      onClick={() => clear(side)}
                    >
                      <IconX className="diff-picker__icon" />
                    </Button>
                  ) : null}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="diff-picker__search">
          <Input
            icon={Search}
            value={query}
            placeholder="Filter files…"
            aria-label="Filter files"
            data-testid="diff-pane-search-input"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (ready) compare();
              else if (shown.length === 1) choose(shown[0]!.node.id);
            }}
          />
        </div>

        <ul
          className="diff-picker__list"
          aria-label={`Files for the ${SIDE_LABEL[active].toLowerCase()} slot`}
        >
          {shown.length === 0 ? (
            <li className="diff-picker__empty">
              {files.length === 0
                ? "No text files to compare yet."
                : "No matching files."}
            </li>
          ) : (
            shown.map(({ node, path }) => {
              const owner: Side | null =
                picked.left === node.id
                  ? "left"
                  : picked.right === node.id
                    ? "right"
                    : null;
              const count = counts[node.id];
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    aria-pressed={owner !== null}
                    className={cn(
                      "diff-picker__option",
                      owner && "diff-picker__option--picked",
                    )}
                    data-testid={`diff-pane-option-${node.id}`}
                    onClick={() => choose(node.id)}
                  >
                    <FileIcon name={node.name} />
                    <span className="diff-picker__option-path">{path}</span>
                    {!owner && count ? (
                      count.added + count.removed === 0 ? (
                        <span className="diff-picker__option-same">
                          identical
                        </span>
                      ) : (
                        <span className="diff-picker__option-counts">
                          <span className="diff-picker__option-count diff-picker__option-count--added">
                            +{count.added}
                          </span>
                          <span className="diff-picker__option-count diff-picker__option-count--removed">
                            −{count.removed}
                          </span>
                        </span>
                      )
                    ) : null}
                    {owner ? (
                      <span
                        className={cn(
                          "diff-picker__option-tag",
                          `diff-picker__option-tag--${SIDE_MOD[owner]}`,
                        )}
                      >
                        {SIDE_LABEL[owner]}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <footer className="diff-picker__foot">
          <span className="diff-picker__hint">
            {ready
              ? "Ready — press Compare or Enter."
              : `Click a file to fill ${SIDE_LABEL[active]}.`}
          </span>
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={ui.ghostBtn}
              data-testid="diff-pane-cancel-button"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className={ui.solidBtn}
            disabled={!ready}
            data-testid="diff-pane-compare-button"
            onClick={compare}
          >
            <IconGitCompare className="diff-picker__icon" />
            Compare
          </Button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Lines each candidate would add / remove against the picked file, computed
 * with jsdiff's line diff (no hunks or highlighting). Contents are cached per
 * save, so typing in the filter never re-reads storage.
 */
function useLineCounts(
  anchor: FsNode | null,
  anchorSide: Side,
  candidates: Candidate[],
  ignoreWhitespace: boolean,
) {
  const cache = React.useRef(new Map<string, string | null>());
  const [counts, setCounts] = React.useState<
    Record<string, { added: number; removed: number }>
  >({});
  const key = candidates.map((c) => `${c.node.id}:${c.node.updatedAt}`).join();

  React.useEffect(() => {
    if (!anchor) {
      setCounts({});
      return;
    }
    let live = true;
    const read = async (node: FsNode) => {
      const k = `${node.id}:${node.updatedAt}`;
      if (!cache.current.has(k)) {
        const value = await storage.getContent(node.id);
        cache.current.set(
          k,
          typeof value === "string" && value.length <= COUNT_LIMIT
            ? value
            : null,
        );
      }
      return cache.current.get(k) ?? null;
    };
    void (async () => {
      const base = await read(anchor);
      const next: Record<string, { added: number; removed: number }> = {};
      if (base !== null) {
        for (const { node } of candidates) {
          if (node.id === anchor.id) continue;
          const text = await read(node);
          if (text === null) continue;
          next[node.id] =
            anchorSide === "left"
              ? countLineChanges(base, text, ignoreWhitespace)
              : countLineChanges(text, base, ignoreWhitespace);
        }
      }
      if (live) setCounts(next);
    })();
    return () => {
      live = false;
    };
    // `key` stands in for `candidates` (a fresh array every render).
  }, [anchor?.id, anchor?.updatedAt, anchorSide, key, ignoreWhitespace]);

  return counts;
}

/* ───────────────────────────── Patch ───────────────────────────── */

function PatchView({
  patch,
  layout,
  onLayout,
  isDark,
}: {
  patch: string;
  layout: DiffLayout;
  onLayout: (layout: DiffLayout) => void;
  isDark: boolean;
}) {
  const parsed = React.useMemo(() => {
    try {
      return { files: parsePatchFiles(patch).flatMap((p) => p.files) };
    } catch (error) {
      return { files: [], error: String(error) };
    }
  }, [patch]);
  const stats = countChanges(parsed.files);
  const { shown, narrow } = useShownLayout(layout);

  return (
    <div className="diff-pane">
      <FileBarSlot>
        <DiffStats {...stats} />
        <LayoutSwitch layout={shown} narrow={narrow} onLayout={onLayout} />
      </FileBarSlot>
      <div className="diff-pane__body" data-testid="diff-pane-view">
        {parsed.files.length === 0 ? (
          <p className="diff-pane__message diff-pane__message--tone-error">
            {parsed.error
              ? `This patch could not be read: ${parsed.error}`
              : "No file changes found in this patch."}
          </p>
        ) : (
          parsed.files.map((fileDiff, i) => (
            <FileDiff
              key={`${fileDiff.prevName ?? ""}:${fileDiff.name}:${i}`}
              fileDiff={fileDiff}
              className="diff-pane__diff diff-pane__diff--stacked"
              options={diffOptions(shown, isDark, false)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Shared ───────────────────────────── */

function diffOptions(layout: DiffLayout, isDark: boolean, hideHeader: boolean) {
  return {
    diffStyle: layout,
    themeType: isDark ? ("dark" as const) : ("light" as const),
    disableFileHeader: hideHeader,
    overflow: "wrap" as const,
    lineDiffType: "word-alt" as const,
    hunkSeparators: "line-info" as const,
  };
}

function countChanges(files: FileDiffMetadata[]) {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }
  }
  return { additions, deletions };
}

function DiffStats({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  return (
    <span
      className="diff-pane__stats"
      data-testid="diff-pane-stats"
      title={`${additions} line${additions === 1 ? "" : "s"} added, ${deletions} removed`}
    >
      <span className="diff-pane__count diff-pane__count--added">
        +{additions}
      </span>
      <span className="diff-pane__count diff-pane__count--deleted">
        −{deletions}
      </span>
    </span>
  );
}

function BarButton({
  label,
  pressed,
  disabled,
  testId,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      data-active={pressed || undefined}
      disabled={disabled}
      className={cn(ui.paneToolbarBtn, "diff-pane__bar-button")}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function LayoutSwitch({
  layout,
  narrow,
  onLayout,
}: {
  layout: DiffLayout;
  /** Too narrow for split: it is offered but disabled. */
  narrow: boolean;
  onLayout: (layout: DiffLayout) => void;
}) {
  const options: Array<[DiffLayout, string, typeof IconColumns2]> = [
    ["split", "Split — original and changed side by side", IconColumns2],
    ["unified", "Unified — changes inline in one column", IconLayoutRows],
  ];
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="Layout"
      value={layout}
      onValueChange={(next) => {
        if (next) onLayout(next as DiffLayout);
      }}
    >
      {options.map(([value, hint, Glyph]) => (
        <ToggleGroupItem
          key={value}
          value={value}
          disabled={narrow && value === "split"}
          aria-label={hint}
          title={
            narrow && value === "split"
              ? "Split needs a wider window — showing unified"
              : hint
          }
          data-testid={`diff-pane-layout-${value}-button`}
        >
          <Glyph className="diff-pane__icon" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
