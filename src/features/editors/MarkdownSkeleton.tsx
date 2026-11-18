import { m } from "motion/react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { exit } from "@/lib/motion";

/** Toolbar clusters, as widths of the joined button groups. */
const TOOLS = ["w-16", "w-24", "w-36", "w-20", "w-28"];
/** Note body: a title, then paragraphs of uneven lines. */
const LINES: Array<"heading" | "gap" | string> = [
  "heading",
  "w-11/12",
  "w-10/12",
  "w-7/12",
  "gap",
  "w-full",
  "w-9/12",
  "w-10/12",
  "w-5/12",
  "gap",
  "w-11/12",
  "w-8/12",
];

/**
 * Placeholder for the Markdown editor, shown instead of the note's raw
 * source while it is not ready: the file read, the MDXEditor chunk download,
 * and MDXEditor's own first render. Mirrors the editor's toolbar and content
 * padding so the swap barely shifts. Fades out when removed inside an
 * `AnimatePresence`.
 *
 * Styles: BEM block `markdown-skeleton` (`src/styles/markdown-skeleton.css`).
 *
 * @param props.overlay - Cover the parent (which must be positioned) instead
 *   of taking up layout space — used while the real editor mounts under it.
 *
 * @example
 * ```tsx
 * <React.Suspense fallback={<MarkdownSkeleton />}>…</React.Suspense>
 * ```
 */
export function MarkdownSkeleton({ overlay = false }: { overlay?: boolean }) {
  return (
    <m.div
      className={cn(
        "markdown-skeleton",
        overlay && "markdown-skeleton--overlay",
      )}
      role="status"
      aria-busy="true"
      aria-label="Loading editor"
      data-testid="markdown-skeleton"
      exit={{ opacity: 0, transition: exit }}
    >
      <div className="markdown-skeleton__toolbar">
        {TOOLS.map((width, i) => (
          <Skeleton key={i} className={cn("markdown-skeleton__tool", width)} />
        ))}
      </div>
      <div className="markdown-skeleton__body">
        {LINES.map((line, i) =>
          line === "gap" ? (
            <div key={i} className="markdown-skeleton__gap" />
          ) : line === "heading" ? (
            <Skeleton
              key={i}
              className="markdown-skeleton__line markdown-skeleton__line--heading"
            />
          ) : (
            <Skeleton key={i} className={cn("markdown-skeleton__line", line)} />
          ),
        )}
      </div>
    </m.div>
  );
}
