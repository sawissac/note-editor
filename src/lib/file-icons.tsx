import {
  IconFileSpreadsheet,
  IconFileText,
  IconFileTypeCsv,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFolder,
  IconFolderOpen,
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
  text: "text-slate-500",
};

export function FileIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const kind = kindOf(name);
  const Glyph = KIND_ICON[kind];
  return (
    <Glyph
      aria-hidden
      className={`size-4 shrink-0 ${KIND_TONE[kind]} ${className ?? ""}`}
    />
  );
}

export function FolderIcon({ open }: { open: boolean }) {
  const Glyph = open ? IconFolderOpen : IconFolder;
  return <Glyph aria-hidden className="size-4 shrink-0 text-app-warn" />;
}
