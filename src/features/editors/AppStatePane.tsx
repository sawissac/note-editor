import "@/styles/app-state-pane.css";
import {
  IconArrowsMaximize,
  IconFoldDown,
  IconFoldUp,
  IconPlayerPause,
  IconPlayerPlay,
} from "@tabler/icons-react";
import {
  easeCubicOut,
  hierarchy,
  type HierarchyPointLink,
  type HierarchyPointNode,
  linkHorizontal,
  select,
  tree as d3tree,
  zoom as d3zoom,
  type ZoomBehavior,
  zoomIdentity,
} from "d3";
import * as React from "react";

import { Button } from "@/components/ui/button";
import * as ui from "@/lib/ui-styles";
import { useCoarsePointer } from "@/lib/use-media-query";
import { saveContent } from "@/store/actions";
import type { FsNode } from "@/store/fs-slice";
import { type RootState, useAppDispatch, useAppStore } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { PaneSplit } from "@/features/editors/pane-split";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";

type ValueType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined";

/** One node of the drawn tree. Containers only get `children` when open. */
type StateNode = {
  /** Stable address, e.g. `$.fs.nodes.abc123.name` — the d3 join key. */
  path: string;
  keys: string[];
  label: string;
  type: ValueType;
  /** Entries in an object / array; 0 for leaves. */
  size: number;
  /** Short value text drawn after the label. */
  preview: string;
  children?: StateNode[];
};

const ROOT = "$";
const DEFAULT_OPEN = [ROOT, "$.fs", "$.tabs", "$.ui"];
const ROW_H = 24;
const COL_W = 240;
const MAX_PREVIEW = 36;
/** Matches the `app-state-pane-flash` animation length. */
const FLASH_MS = 900;

function typeOf(value: unknown): ValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "object") return "object";
  if (t === "string" || t === "number" || t === "boolean") return t;
  return "undefined";
}

function clip(text: string, max = MAX_PREVIEW) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Long generated ids (uuids, nanoids) read better shortened: `17c53920…`. */
function shortKey(key: string) {
  return key.length > 16 && /\d/.test(key) && !/\s/.test(key)
    ? `${key.slice(0, 8)}…`
    : key;
}

function childPath(path: string, key: string, parentType: ValueType) {
  return parentType === "array" ? `${path}[${key}]` : `${path}.${key}`;
}

/**
 * Turns the store into a tree, descending only into open containers so a
 * big workspace stays cheap to lay out. File ids are annotated with the
 * file's name wherever they appear (`fs.nodes`, `tabs.openIds`, …).
 */
function buildTree(
  value: unknown,
  key: string,
  path: string,
  keys: string[],
  open: ReadonlySet<string>,
  files: Record<string, FsNode>,
): StateNode {
  const type = typeOf(value);
  const named =
    type === "object" &&
    typeof (value as { name?: unknown }).name === "string"
      ? ` · ${(value as { name: string }).name}`
      : "";
  const label = path === ROOT ? "store" : `${shortKey(key)}${named}`;

  if (type === "object" || type === "array") {
    const entries =
      type === "array"
        ? (value as unknown[]).map((v, i) => [String(i), v] as const)
        : Object.entries(value as Record<string, unknown>);
    const node: StateNode = {
      path,
      keys,
      label,
      type,
      size: entries.length,
      preview: type === "array" ? `[${entries.length}]` : `{${entries.length}}`,
    };
    if (open.has(path) && entries.length) {
      node.children = entries.map(([k, v]) =>
        buildTree(v, k, childPath(path, k, type), [...keys, k], open, files),
      );
    }
    return node;
  }

  let preview: string;
  if (type === "string") {
    const s = value as string;
    const file = files[s];
    preview = file ? `${shortKey(s)} → ${file.name}` : JSON.stringify(clip(s));
  } else {
    preview = String(value);
  }
  return { path, keys, label, type, size: 0, preview: clip(preview, 48) };
}

/** Every container path in `value` — for "Expand all". */
function containerPaths(value: unknown, path = ROOT, out: string[] = []) {
  const type = typeOf(value);
  if (type !== "object" && type !== "array") return out;
  out.push(path);
  const entries =
    type === "array"
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
  for (const [k, v] of entries) containerPaths(v, childPath(path, k, type), out);
  return out;
}

function valueAt(state: unknown, keys: string[]) {
  let cur: unknown = state;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

const link = linkHorizontal<unknown, { x: number; y: number }>()
  .x((d) => d.y)
  .y((d) => d.x);

/**
 * `app.state`: the live Redux store (`fs`, `tabs`, `ui`) drawn as a
 * collapsible d3 tree. Click a node to open/close it and inspect its value in
 * the side panel; drag to pan, scroll to zoom. Values that change since the
 * last frame flash. The file bar pauses live updates, expands / collapses
 * everything and fits the tree to the view. ⌘/Ctrl+S (and Download) write
 * the current state into the file as JSON.
 *
 * Test ids: `app-state-pane`, `app-state-pane-graph`,
 * `app-state-pane-node-<path>`, `app-state-pane-detail-content`,
 * `app-state-pane-<files|folders|tabs|updates>-count-message`,
 * `app-state-pane-pause-button`, `app-state-pane-expand-button`,
 * `app-state-pane-collapse-button`, `app-state-pane-fit-button`.
 *
 * CSS block: `app-state-pane` (`src/styles/app-state-pane.css`).
 */
export default function AppStatePane({ id, registerSave }: PaneProps) {
  const dispatch = useAppDispatch();
  // The whole store on purpose — `useAppSelector(s => s)` trips react-redux's
  // identity-selector warning, so subscribe directly.
  const store = useAppStore();
  const live = React.useSyncExternalStore(store.subscribe, store.getState);
  const [frozen, setFrozen] = React.useState<RootState | null>(null);
  const state = frozen ?? live;

  const [open, setOpen] = React.useState<Set<string>>(
    () => new Set(DEFAULT_OPEN),
  );
  /** Path + keys of the inspected node; kept even when its parent closes. */
  const [picked, setPicked] = React.useState<{ path: string; keys: string[] }>(
    { path: ROOT, keys: [] },
  );
  const selected = picked.path;
  const [updates, setUpdates] = React.useState(0);
  const [updatedAt, setUpdatedAt] = React.useState(() => new Date());

  // Count store changes while live — a heartbeat for the side panel.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setUpdates((n) => n + 1);
    setUpdatedAt(new Date());
  }, [live]);

  const latest = React.useRef(state);
  latest.current = state;
  useSaveHandler(registerSave, () =>
    dispatch(
      saveContent(id, `${JSON.stringify(latest.current, null, 2)}\n`),
    ),
  );

  const data = React.useMemo(
    () => buildTree(state, ROOT, ROOT, [], open, state.fs.nodes),
    [state, open],
  );

  const svgRef = React.useRef<SVGSVGElement>(null);
  const viewRef = React.useRef<SVGGElement>(null);
  const linksRef = React.useRef<SVGGElement>(null);
  const nodesRef = React.useRef<SVGGElement>(null);
  const zoomRef = React.useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(
    null,
  );
  /** Last drawn position and preview per path: enter-from and change flash. */
  const prevPos = React.useRef(new Map<string, { x: number; y: number }>());
  const prevPreview = React.useRef(new Map<string, string>());
  /** When each path's value last changed — keeps the flash class on long
   *  enough to play even if another update re-renders right after. */
  const changedAt = React.useRef(new Map<string, number>());

  const onNode = React.useRef<(d: StateNode) => void>(() => undefined);
  onNode.current = (d) => {
    setPicked({ path: d.path, keys: d.keys });
    if (d.size > 0) {
      setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(d.path)) next.delete(d.path);
        else next.add(d.path);
        return next;
      });
    }
  };

  // Pan / zoom, set up once.
  React.useEffect(() => {
    const svg = svgRef.current;
    const view = viewRef.current;
    if (!svg || !view) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on("zoom", (e) => {
        view.setAttribute("transform", e.transform.toString());
      });
    const sel = select(svg);
    sel.call(behavior).on("dblclick.zoom", null);
    sel.call(
      behavior.transform,
      zoomIdentity.translate(56, svg.clientHeight / 2 || 200),
    );
    zoomRef.current = behavior;
    return () => {
      sel.on(".zoom", null);
    };
  }, []);

  // Draw / update the tree.
  React.useEffect(() => {
    const linksEl = linksRef.current;
    const nodesEl = nodesRef.current;
    if (!linksEl || !nodesEl) return;

    const root = d3tree<StateNode>().nodeSize([ROW_H, COL_W])(
      hierarchy(data, (d) => d.children),
    );
    const nodes = root.descendants();
    const links = root.links();
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = reduce ? 0 : 380;

    const from = (d: HierarchyPointNode<StateNode>) => {
      const parent = d.parent;
      if (!parent) return { x: d.x, y: d.y };
      return prevPos.current.get(parent.data.path) ?? { x: parent.x, y: parent.y };
    };

    // Links.
    select(linksEl)
      .selectAll<SVGPathElement, HierarchyPointLink<StateNode>>("path")
      .data(links, (d) => d.target.data.path)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "app-state-pane__link")
            .attr("d", (d) => {
              const p = from(d.target);
              return link({ source: p, target: p });
            }),
        (update) => update,
        (exit) =>
          exit.transition().duration(duration).style("opacity", 0).remove(),
      )
      .transition()
      .duration(duration)
      .ease(easeCubicOut)
      .attr("d", (d) => link({ source: d.source, target: d.target }));

    // Nodes.
    const prev = prevPreview.current;
    const now = performance.now();
    for (const d of nodes) {
      const before = prev.get(d.data.path);
      if (before !== undefined && before !== d.data.preview) {
        changedAt.current.set(d.data.path, now);
      }
    }
    const joined = select(nodesEl)
      .selectAll<SVGGElement, HierarchyPointNode<StateNode>>(
        ".app-state-pane__node",
      )
      .data(nodes, (d) => d.data.path)
      .join(
        (enter) => {
          const g = enter
            .append("g")
            .attr("class", "app-state-pane__node")
            .attr("tabindex", 0)
            .attr("role", "button")
            .style("opacity", 0)
            .attr("transform", (d) => {
              const p = from(d);
              return `translate(${p.y},${p.x})`;
            });
          g.append("circle").attr("r", 5);
          // Invisible hit area: a 5px dot is too small for a finger. A rect,
          // not a circle, so `select("circle")` and the focus ring skip it.
          g.append("rect")
            .attr("class", "app-state-pane__hit")
            .attr("x", -ROW_H / 2)
            .attr("y", -ROW_H / 2)
            .attr("width", ROW_H)
            .attr("height", ROW_H);
          const text = g
            .append("text")
            .attr("class", "app-state-pane__text")
            .attr("x", 10)
            .attr("dy", "0.32em");
          text.append("tspan").attr("class", "app-state-pane__label");
          text
            .append("tspan")
            .attr("class", "app-state-pane__value")
            .attr("dx", 6);
          return g;
        },
        (update) => update,
        (exit) =>
          exit.transition().duration(duration).style("opacity", 0).remove(),
      );

    joined
      .attr("data-testid", (d) => `app-state-pane-node-${d.data.path}`)
      .attr("aria-label", (d) =>
        d.data.size
          ? `${d.data.label}, ${d.data.size} entries, ${d.children ? "open" : "closed"}`
          : `${d.data.label}: ${d.data.preview}`,
      )
      .attr("aria-expanded", (d) =>
        d.data.size ? String(Boolean(d.children)) : null,
      )
      .on("click", (_e, d) => onNode.current(d.data))
      .on("keydown", (e: KeyboardEvent, d) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNode.current(d.data);
        }
      });

    joined.select("circle").attr("class", (d) => {
      const c = ["app-state-pane__dot", `app-state-pane__dot--type-${d.data.type}`];
      if (d.data.size > 0 && !d.children) c.push("app-state-pane__dot--closed");
      if (d.data.path === selected) c.push("app-state-pane__dot--selected");
      const at = changedAt.current.get(d.data.path);
      if (at !== undefined && now - at < FLASH_MS) {
        c.push("app-state-pane__dot--changed");
      }
      return c.join(" ");
    });
    joined
      .select(".app-state-pane__label")
      .attr("class", (d) =>
        d.data.path === selected
          ? "app-state-pane__label app-state-pane__label--selected"
          : "app-state-pane__label",
      )
      .text((d) => d.data.label);
    joined
      .select(".app-state-pane__value")
      .attr("class", (d) =>
        `app-state-pane__value app-state-pane__value--type-${d.data.type}`,
      )
      .text((d) => d.data.preview);

    joined
      .transition()
      .duration(duration)
      .ease(easeCubicOut)
      .style("opacity", 1)
      .attr("transform", (d) => `translate(${d.y},${d.x})`);

    prevPos.current = new Map(nodes.map((d) => [d.data.path, { x: d.x, y: d.y }]));
    for (const d of nodes) prev.set(d.data.path, d.data.preview);
  }, [data, selected]);

  const fit = () => {
    const svg = svgRef.current;
    const view = viewRef.current;
    const behavior = zoomRef.current;
    if (!svg || !view || !behavior) return;
    const box = view.getBBox();
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    if (!box.width || !box.height) return;
    const k = Math.min(1.6, 0.9 * Math.min(w / box.width, h / box.height));
    const tx = w / 2 - k * (box.x + box.width / 2);
    const ty = h / 2 - k * (box.y + box.height / 2);
    select(svg)
      .transition()
      .duration(500)
      .call(behavior.transform, zoomIdentity.translate(tx, ty).scale(k));
  };

  const coarse = useCoarsePointer();
  const files = Object.values(state.fs.nodes);
  const counts = [
    {
      id: "files",
      label: "Files",
      value: files.filter((n) => n.type === "file").length,
    },
    {
      id: "folders",
      label: "Folders",
      value: files.filter((n) => n.type === "folder").length,
    },
    { id: "tabs", label: "Open tabs", value: state.tabs.openIds.length },
    { id: "updates", label: "Updates", value: updates },
  ];

  const detail = React.useMemo(() => {
    const value = valueAt(state, picked.keys);
    const text = JSON.stringify(value, null, 2) ?? String(value);
    return text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text;
  }, [state, picked.keys]);

  return (
    <>
      <FileBarSlot>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-active={frozen ? true : undefined}
          aria-pressed={Boolean(frozen)}
          data-testid="app-state-pane-pause-button"
          title={frozen ? "Follow the store again" : "Freeze the current state"}
          onClick={() => setFrozen((f) => (f ? null : live))}
        >
          {frozen ? (
            <IconPlayerPlay aria-hidden className="pane-icon" />
          ) : (
            <IconPlayerPause aria-hidden className="pane-icon" />
          )}
          {frozen ? "Resume" : "Pause"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="app-state-pane-expand-button"
          title="Open every object and array"
          onClick={() => setOpen(new Set(containerPaths(state)))}
        >
          <IconFoldDown aria-hidden className="pane-icon" />
          Expand
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="app-state-pane-collapse-button"
          title="Back to the top-level slices"
          onClick={() => setOpen(new Set(DEFAULT_OPEN))}
        >
          <IconFoldUp aria-hidden className="pane-icon" />
          Collapse
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="app-state-pane-fit-button"
          title="Fit the tree to the view"
          onClick={fit}
        >
          <IconArrowsMaximize aria-hidden className="pane-icon" />
          Fit
        </Button>
      </FileBarSlot>

      <div className="app-state-pane" data-testid="app-state-pane">
        <PaneSplit sideSize="20rem">
          <div className="app-state-pane__stage">
            <svg
              ref={svgRef}
              className="app-state-pane__graph"
              data-testid="app-state-pane-graph"
              role="group"
              aria-label="App state tree"
            >
              <g ref={viewRef}>
                <g ref={linksRef} />
                <g ref={nodesRef} />
              </g>
            </svg>
            <p className="app-state-pane__hint">
              {frozen ? "Paused · " : "Live · "}
              {coarse
                ? "tap to open · drag to pan · pinch to zoom"
                : "click to open · drag to pan · scroll to zoom"}
            </p>
          </div>

          <aside className="app-state-pane__side" aria-label="State details">
            <section className="app-state-pane__section">
              <h3 className="app-state-pane__heading">Store</h3>
              <dl className="app-state-pane__counts">
                {counts.map((c) => (
                  <div key={c.id} className="app-state-pane__count">
                    <dt className="app-state-pane__count-label">{c.label}</dt>
                    <dd
                      className="app-state-pane__count-value"
                      data-testid={`app-state-pane-${c.id}-count-message`}
                    >
                      {c.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="app-state-pane__meta">
                Last change {updatedAt.toLocaleTimeString()}
              </p>
            </section>
            <section className="app-state-pane__section app-state-pane__section--grow">
              <h3 className="app-state-pane__heading">Selected</h3>
              <p className="app-state-pane__path">{selected}</p>
              <pre
                className="app-state-pane__detail"
                data-testid="app-state-pane-detail-content"
              >
                {detail}
              </pre>
            </section>
            <section className="app-state-pane__section">
              <h3 className="app-state-pane__heading">Legend</h3>
              <ul className="app-state-pane__legend">
                {(
                  ["object", "array", "string", "number", "boolean", "null"] as const
                ).map((t) => (
                  <li key={t} className="app-state-pane__legend-item">
                    <svg
                      className="app-state-pane__legend-swatch"
                      viewBox="0 0 12 12"
                      aria-hidden
                    >
                      <circle
                        cx="6"
                        cy="6"
                        r="4.5"
                        className={`app-state-pane__dot app-state-pane__dot--type-${t}`}
                      />
                    </svg>
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </PaneSplit>
      </div>
    </>
  );
}
