import {
  IconBinaryTree,
  IconBraces,
  IconInfoHexagon,
  IconCalendarEvent,
  IconDatabase,
  IconFileCode,
  IconKey,
  IconLockAccess,
  IconLayoutKanban,
  IconAlarm,
  IconMessageChatbot,
  IconPhoto,
  IconQrcode,
  IconRegex,
  IconSettings,
  IconFileSpreadsheet,
  IconFileText,
  IconFileTypeCsv,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFolder,
  IconFolderOpen,
  IconGitCompare,
  IconMarkdown,
  IconSchema,
  IconSitemap,
  type Icon,
} from "@tabler/icons-react";

import { type FileKind, kindOf } from "@/lib/file-types";

const KIND_ICON: Record<FileKind, Icon> = {
  markdown: IconMarkdown,
  csv: IconFileTypeCsv,
  pdf: IconFileTypePdf,
  docx: IconFileTypeDocx,
  xlsx: IconFileSpreadsheet,
  schema: IconSchema,
  mermaid: IconSitemap,
  calendar: IconCalendarEvent,
  kanban: IconLayoutKanban,
  json: IconBraces,
  yaml: IconFileCode,
  toml: IconSettings,
  sql: IconDatabase,
  env: IconKey,
  apikeys: IconLockAccess,
  regex: IconRegex,
  diff: IconGitCompare,
  qr: IconQrcode,
  timer: IconAlarm,
  chat: IconMessageChatbot,
  appinfo: IconInfoHexagon,
  appstate: IconBinaryTree,
  image: IconPhoto,
  text: IconFileText,
};

/**
 * One colour per file type — the "mixed" half of the light theme: the
 * surfaces stay neutral, so these are what tell files apart at a glance.
 * Hues follow each format's usual association (Word blue, Excel green,
 * PDF red) and are 600-weight so they hold contrast on white and grey.
 */
const KIND_TONE: Record<FileKind, string> = {
  markdown: "text-sky-600",
  csv: "text-teal-600",
  pdf: "text-red-600",
  docx: "text-blue-600",
  xlsx: "text-green-600",
  schema: "text-amber-600",
  mermaid: "text-fuchsia-600",
  calendar: "text-red-500",
  kanban: "text-violet-600",
  json: "text-yellow-600",
  yaml: "text-rose-600",
  toml: "text-orange-600",
  sql: "text-cyan-600",
  env: "text-lime-600",
  apikeys: "text-indigo-600",
  regex: "text-violet-600",
  diff: "text-emerald-600",
  qr: "text-zinc-700",
  timer: "text-orange-500",
  chat: "text-purple-600",
  appinfo: "text-sky-700",
  appstate: "text-emerald-700",
  image: "text-pink-600",
  text: "text-slate-500",
};

export function FileIcon({
  name,
  className,
  unsized = false,
}: {
  name: string;
  className?: string;
  /** Skip the default `size-4`, so the caller's CSS sets the size. */
  unsized?: boolean;
}) {
  const kind = kindOf(name);
  const Glyph = KIND_ICON[kind];
  return (
    <Glyph
      aria-hidden
      className={`${unsized ? "" : "size-4 "}shrink-0 ${KIND_TONE[kind]} ${className ?? ""}`}
    />
  );
}

export function FolderIcon({ open }: { open: boolean }) {
  const Glyph = open ? IconFolderOpen : IconFolder;
  return <Glyph aria-hidden className="text-app-warn size-4 shrink-0" />;
}
