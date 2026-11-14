# note-editor

A local-first note editor: Markdown as the main editor, plus PDF, Word, Excel
and CSV editors/viewers, a tree-view explorer and scrollable tabs. Everything
is stored in the browser (IndexedDB via localforage).

## Stack

- React 19 + Vite + TypeScript, Tailwind CSS v4
- Redux Toolkit (`src/store`) — workspace tree, tabs, UI state
- localforage (`src/lib/storage.ts`) — `meta` store for the workspace, `contents` store per file
- [@mdxeditor/editor](https://mdxeditor.dev) — Markdown editor (rich text / source / diff)
- [Extend UI](https://www.extend.ai/ui/docs) (`src/components/extend`) — PDF, DOCX, XLSX editors and viewers, CSV viewer
- [compacto-ui](https://github.com/sawissac/compacto-ui) (`src/components/ui`) — app chrome, dialogs, menus, sidebar, theming
- shadcn primitives (`src/components/shadcn`) — only as dependencies of the Extend components, bridged to compacto tokens by `styles/compacto/compat-shadcn.css`
- @tabler/icons-react

## Scripts

```bash
pnpm install
pnpm dev         # http://localhost:5173
pnpm typecheck
pnpm build
```

## Using it

| Action | How |
| --- | --- |
| New file / folder | Explorer header, a folder's hover buttons, or right-click → type the name inline (Enter commits, Esc cancels; `.md` is added when no extension is given) |
| Rename | F2, double-click a file, or right-click → Rename (the base name is pre-selected) |
| Delete | Delete key or right-click → Delete; a dialog confirms and lists how many items a folder contains |
| Move | Drag a row onto a folder (or empty space for the root) |
| Import | Explorer header → Import, or drop files from your OS onto the tree |
| Tabs | Mouse wheel scrolls horizontally, middle-click closes, drag to reorder, right-click for close others / to the right / all |
| Quick open | ⌘/Ctrl + P |
| Save | Markdown, CSV and text autosave. PDF, Word and Excel save with ⌘/Ctrl + S or the Save button |
| Theme | Palette picker in the status bar |

## Layout

```
src/
  components/ui        compacto-ui copies (+ context-menu.tsx written to its conventions)
  components/extend    Extend UI copies (docx/xlsx editors register a save bridge)
  components/shadcn    shadcn primitives used by Extend
  features/explorer    tree view, inline create/rename, delete & import dialogs
  features/tabs        scrollable tab bar
  features/editors     editor host + one pane per file kind (lazy-loaded)
  features/workspace   quick open, status bar
  store                Redux slices, thunks, selectors, persistence
  lib                  storage, file types, icons
```
