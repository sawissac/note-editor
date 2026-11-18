import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/**
 * Lines of a code file: indent level, then the line's width (`null` for a
 * blank line). Uneven so it reads as source, not a stamped pattern.
 */
const ROWS: Array<[0 | 1 | 2, string | null]> = [
  [0, "w-2/5"],
  [1, "w-3/5"],
  [2, "w-1/2"],
  [2, "w-2/3"],
  [1, "w-1/4"],
  [0, null],
  [0, "w-1/3"],
  [1, "w-1/2"],
  [1, "w-3/4"],
  [2, "w-2/5"],
  [1, "w-1/5"],
  [0, null],
  [0, "w-1/2"],
  [1, "w-2/5"],
  [1, "w-3/5"],
  [0, "w-1/6"],
  [0, null],
  [0, "w-2/5"],
  [1, "w-2/3"],
  [2, "w-1/2"],
  [2, "w-1/3"],
  [1, "w-1/4"],
  [0, null],
  [0, "w-3/5"],
  [1, "w-1/2"],
  [0, "w-1/5"],
];

/**
 * Placeholder for the Monaco code editor, shown while its chunk downloads
 * and while Monaco boots. Mirrors the editor's top padding, 22px line height
 * and line-number gutter so the real editor swaps in without a shift.
 *
 * Styles: BEM block `code-skeleton` (`src/styles/code-skeleton.css`).
 *
 * @param props.embedded - Part of a larger loading placeholder that already
 *   announces the loading state: drop the status role and test id.
 *
 * @example
 * ```tsx
 * <React.Suspense fallback={<CodeSkeleton />}>…</React.Suspense>
 * ```
 */
export function CodeSkeleton({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      className="code-skeleton"
      {...(embedded
        ? { "aria-hidden": true }
        : {
            role: "status",
            "aria-busy": true,
            "aria-label": "Loading editor",
            "data-testid": "code-skeleton",
          })}
    >
      {ROWS.map(([indent, width], i) => (
        <div key={i} className="code-skeleton__row">
          <span className="code-skeleton__gutter">
            <Skeleton className="code-skeleton__number" />
          </span>
          {width ? (
            <Skeleton
              className={cn(
                "code-skeleton__line",
                indent === 1 && "code-skeleton__line--indent-1",
                indent === 2 && "code-skeleton__line--indent-2",
                width,
              )}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
