import * as React from "react";

// Monaco is large — fetch it only when a text or Mermaid editor mounts.
const CodeEditor = React.lazy(() => import("@/features/editors/CodeEditor"));

/**
 * {@link CodeEditor} behind its own Suspense boundary, so the pane that hosts
 * it commits (and keeps its one-shot state such as `autoFocus`) while Monaco
 * is still loading.
 */
export function LazyCodeEditor(props: React.ComponentProps<typeof CodeEditor>) {
  return (
    <React.Suspense fallback={<div className="h-full bg-app-bg" />}>
      <CodeEditor {...props} />
    </React.Suspense>
  );
}
