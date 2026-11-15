import * as React from "react";

import { BINARY_KINDS, kindOf } from "@/lib/file-types";
import { storage } from "@/lib/storage";
import type { FsNode } from "@/store/fs-slice";

export type ContentHit = {
  id: string;
  fileId: string;
  /** 1-based line number of the match. */
  line: number;
  /** The line, trimmed around the match. */
  text: string;
  /** Match range inside `text`. */
  start: number;
  end: number;
};

/** Secrets are never read into the palette — their values stay hidden. */
const SKIPPED_KINDS = new Set(["env", "apikeys"]);
const MAX_HITS = 200;
const MAX_PER_FILE = 5;
const SNIPPET = 90;

function searchable(node: FsNode) {
  if (node.type !== "file") return false;
  const kind = kindOf(node.name);
  return !BINARY_KINDS.has(kind) && !SKIPPED_KINDS.has(kind);
}

function snippet(line: string, index: number, length: number) {
  const lead = Math.max(0, index - 30);
  const raw = line.slice(lead, lead + SNIPPET);
  const trimmed = raw.trimStart();
  const cut = raw.length - trimmed.length;
  const prefix = lead > 0 ? "…" : "";
  return {
    text:
      prefix + trimmed.trimEnd() + (lead + SNIPPET < line.length ? "…" : ""),
    start: prefix.length + index - lead - cut,
    end: prefix.length + index - lead - cut + length,
  };
}

/**
 * Case-insensitive full-text search over every text file in the workspace.
 * Runs after a short pause in typing; stale searches are dropped.
 */
export function useContentSearch(
  nodes: Record<string, FsNode>,
  query: string,
  enabled: boolean,
) {
  const [hits, setHits] = React.useState<ContentHit[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const needle = query.trim().toLowerCase();
    if (!enabled || needle.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(async () => {
      const found: ContentHit[] = [];
      const files = Object.values(nodes)
        .filter(searchable)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      for (const file of files) {
        if (cancelled || found.length >= MAX_HITS) break;
        const content = await storage.getContent(file.id);
        if (typeof content !== "string") continue;
        if (!content.toLowerCase().includes(needle)) continue;
        const lines = content.split(/\r?\n/);
        let perFile = 0;
        for (let i = 0; i < lines.length && perFile < MAX_PER_FILE; i++) {
          const index = lines[i].toLowerCase().indexOf(needle);
          if (index < 0) continue;
          perFile++;
          found.push({
            id: `${file.id}:${i}`,
            fileId: file.id,
            line: i + 1,
            ...snippet(lines[i], index, needle.length),
          });
        }
      }
      if (cancelled) return;
      setHits(found);
      setBusy(false);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nodes, query, enabled]);

  return { hits, busy };
}
