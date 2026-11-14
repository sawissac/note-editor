import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  optimizeDeps: {
    // The schema builder is lazy-loaded, so without this Vite finds these
    // deps mid-session, re-optimizes, and the JSON view's shiki chunks 504.
    include: [
      "@pierre/diffs",
      "@pierre/diffs/react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "next-themes",
      // Lazy-loaded editors (Monaco for .txt / .mermaid, Mermaid renderer).
      "monaco-editor",
      "@monaco-editor/react",
      "mermaid",
    ],
  },
});
