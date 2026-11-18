import * as React from "react";

import { CodeSkeleton } from "@/features/editors/CodeSkeleton";

// Monaco is large — fetch it only when a text or Mermaid editor mounts.
const CodeEditor = React.lazy(() => import("@/features/editors/CodeEditor"));

/**
 * {@link CodeEditor} behind its own Suspense boundary, so the pane that hosts
 * it commits (and keeps its one-shot state such as `autoFocus`) while Monaco
 * is still loading.
 */
export function LazyCodeEditor(props: React.ComponentProps<typeof CodeEditor>) {
  return (
    <React.Suspense
      fallback={
        // A one-line field stays blank: a code-shaped placeholder won't fit.
        props.singleLine ? (
          <div className="bg-app-bg h-full" />
        ) : (
          <CodeSkeleton />
        )
      }
    >
      <CodeEditor {...props} />
    </React.Suspense>
  );
}
