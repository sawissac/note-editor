/**
 * Whole-workspace backup: one JSON file holding everything the user made —
 * the explorer tree, open tabs, sidebar state, every file's content, and the
 * app's localStorage (running timers, saved PDF signatures, UI toggles).
 *
 * Text files are stored as UTF-8 strings; binary files (PDF, DOCX, XLSX,
 * images) as base64. Contents are keyed by file id, the same key IndexedDB
 * uses, so a restore can write them straight back. `path` is informational.
 *
 * Note: API-key files (`.gemini`, `.openrouter`) are included unmasked — a
 * backup that drops them could not be restored faithfully.
 */
import { format } from "date-fns";

import type { FileContent } from "@/lib/storage";
import type { FsNode } from "@/store/fs-slice";
import type { TabsState } from "@/store/tabs-slice";

export const BACKUP_FORMAT = "bento-workspace";
export const BACKUP_VERSION = 1;

export type BackupFile = {
  /** Slash-joined path in the explorer, for humans reading the file. */
  path: string;
  encoding: "utf8" | "base64";
  data: string;
};

export type WorkspaceBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  workspace: {
    fs: {
      nodes: Record<string, FsNode>;
      expanded: Record<string, true>;
      selectedId: string | null;
    };
    tabs: TabsState;
    sidebarOpen: boolean;
  };
  /** File id → content. Files never saved have no entry. */
  files: Record<string, BackupFile>;
  /** Every localStorage entry of this origin, raw strings. */
  localStorage: Record<string, string>;
};

/** Base64 of a buffer without building a giant binary string. */
function toBase64(buffer: ArrayBuffer) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([buffer]));
  });
}

function readLocalStorage() {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const value = localStorage.getItem(key);
      if (value !== null) out[key] = value;
    }
  } catch {
    // Storage blocked — the backup still carries the workspace and files.
  }
  return out;
}

export async function buildWorkspaceBackup(input: {
  workspace: WorkspaceBackup["workspace"];
  pathOf: (id: string) => string;
  readContent: (id: string) => Promise<FileContent | null>;
}): Promise<WorkspaceBackup> {
  const files: Record<string, BackupFile> = {};
  const fileNodes = Object.values(input.workspace.fs.nodes).filter(
    (n) => n.type === "file",
  );
  await Promise.all(
    fileNodes.map(async (node) => {
      const content = await input.readContent(node.id);
      if (content === null || content === undefined) return;
      files[node.id] =
        typeof content === "string"
          ? { path: input.pathOf(node.id), encoding: "utf8", data: content }
          : {
              path: input.pathOf(node.id),
              encoding: "base64",
              data: await toBase64(content),
            };
    }),
  );

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: input.workspace,
    files,
    localStorage: readLocalStorage(),
  };
}

export function backupFileName(date = new Date()) {
  return `bento-backup-${format(date, "yyyy-MM-dd-HHmm")}.json`;
}
