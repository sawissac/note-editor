import "@/styles/bookmark-pane.css";
import {
  IconAlertTriangle,
  IconBookmarks,
  IconCheck,
  IconCopy,
  IconFolder,
  IconFolderPlus,
  IconInbox,
  IconLayoutGrid,
  IconLayoutList,
  IconLoader2,
  IconPencil,
  IconPhotoSearch,
  IconPlus,
  IconRefresh,
  IconSortAscending,
  IconSortAZ,
  IconSortDescending,
  IconStar,
  IconStarFilled,
  IconTag,
  IconTrash,
  IconUpload,
  IconWorldWww,
  IconX,
} from "@tabler/icons-react";
import { Search } from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Bookmark,
  type BookmarkDoc,
  type BookmarkPreview,
  type BookmarkSort,
  displayDescription,
  displayTitle,
  folderPath,
  folderSubtree,
  folderTree,
  hostOf,
  httpUrl,
  newBookmarkId,
  normalizeTags,
  normalizeUrl,
  parseBookmarkHtml,
  parseBookmarks,
  removeFolder,
  serializeBookmarks,
  sortBookmarks,
  urlKey,
} from "@/lib/bookmark-doc";
import { fetchBookmarkPreview } from "@/lib/bookmark-preview";
import { cn } from "@/lib/cn";
import { enter, exit, glide, quick } from "@/lib/motion";
import { Unfold } from "@/components/unfold";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { PaneSplit } from "@/features/editors/pane-split";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

/** Drag payload of a bookmark card moved onto a folder. */
const DRAG_TYPE = "application/x-bento-bookmark";
/** Previews fetched per "Fetch previews" click (the free tier is ~50/day). */
const PREVIEW_BATCH = 20;
const NO_FOLDER = "__none";

type Scope =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "unsorted" }
  | { type: "folder"; id: string };

type Notice = {
  tone: "info" | "error";
  text: string;
  undo?: () => void;
};

/** What the add / edit dialog works on. */
type Draft = Pick<
  Bookmark,
  "url" | "title" | "description" | "tags" | "folderId" | "favorite" | "preview"
> & { id: string | null };

const SORT_LABEL: Record<BookmarkSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  title: "Title A–Z",
  site: "Website",
};

/** Glyph shown beside each sort, in the menu and on the closed trigger. */
const SORT_ICON: Record<BookmarkSort, typeof IconSortAZ> = {
  newest: IconSortDescending,
  oldest: IconSortAscending,
  title: IconSortAZ,
  site: IconWorldWww,
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest("input, textarea, select, [contenteditable=true]"));

/** URLs in pasted or dropped text, one per line or space-separated. */
function urlsIn(text: string) {
  return text
    .split(/\s+/)
    .filter((part) => part && !part.startsWith("#"))
    .map(normalizeUrl)
    .filter((url): url is string => Boolean(url));
}

/**
 * `.bookmark` files: a bookmark manager. Folders, favorites and tags in the
 * left column filter the cards on the right; search matches title, address,
 * description and tags. Paste a link anywhere in the pane, or drop one from
 * the browser, to save it into the open folder. New links get a website
 * preview (title, description, picture) fetched once and stored in the file.
 * Cards drag onto a folder to move them. Browser bookmark files
 * (`bookmarks.html`) import from the file bar.
 */
export default function BookmarkPane({
  id,
  name,
  content,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const initial = React.useMemo(() => {
    try {
      return {
        doc: parseBookmarks(typeof content === "string" ? content : ""),
        error: null as string | null,
      };
    } catch (error) {
      return { doc: parseBookmarks(""), error: (error as Error).message };
    }
    // Mounted per file — `content` only seeds state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [doc, setDoc] = React.useState<BookmarkDoc>(initial.doc);
  const [parseError, setParseError] = React.useState(initial.error);
  const docRef = React.useRef(doc);
  docRef.current = doc;

  const [scope, setScope] = React.useState<Scope>({ type: "all" });
  const [activeTags, setActiveTags] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [dialogKey, setDialogKey] = React.useState(0);
  const [fetching, setFetching] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = React.useState(false);
  /** False until the card list has painted once (gates the entry stagger). */
  const listPainted = React.useRef(false);
  React.useEffect(() => {
    listPainted.current = true;
  }, []);
  const importRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef(new AbortController());
  React.useEffect(() => {
    abortRef.current = new AbortController();
    return () => abortRef.current.abort();
  }, []);

  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => {
    if (!parseError) {
      dispatch(saveContent(id, serializeBookmarks(docRef.current)));
    }
  });

  const update = (fn: (d: BookmarkDoc) => BookmarkDoc) => {
    const next = fn(docRef.current);
    docRef.current = next;
    setDoc(next);
    setParseError(null);
    save(serializeBookmarks(next));
  };
  const patchBookmark = (bookmarkId: string, patch: Partial<Bookmark>) =>
    update((d) => ({
      ...d,
      bookmarks: d.bookmarks.map((b) =>
        b.id === bookmarkId ? { ...b, ...patch } : b,
      ),
    }));

  /* ── Previews ─────────────────────────────────────────────────────── */

  const loadPreviews = async (ids: string[]) => {
    if (!ids.length) return;
    const { signal } = abortRef.current;
    setFetching((prev) => new Set([...prev, ...ids]));
    let failed = 0;
    let lastError = "";
    let next = 0;
    const worker = async () => {
      while (next < ids.length && !signal.aborted) {
        const bookmarkId = ids[next++];
        const bookmark = docRef.current.bookmarks.find(
          (b) => b.id === bookmarkId,
        );
        try {
          if (bookmark) {
            const preview = await fetchBookmarkPreview(bookmark.url, signal);
            if (!signal.aborted) patchBookmark(bookmarkId, { preview });
          }
        } catch (error) {
          if (!signal.aborted) {
            failed += 1;
            lastError = (error as Error).message;
          }
        } finally {
          setFetching((prev) => {
            const rest = new Set(prev);
            rest.delete(bookmarkId);
            return rest;
          });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (failed && !signal.aborted) {
      setNotice({
        tone: "error",
        text:
          failed === 1
            ? `Preview not loaded: ${lastError}`
            : `${failed} previews not loaded: ${lastError}`,
      });
    }
  };

  /* ── Adding ───────────────────────────────────────────────────────── */

  const scopeFolderId = scope.type === "folder" ? scope.id : null;

  /** Saves links straight away (paste / drop); repeats are skipped. */
  const quickAdd = (urls: string[]) => {
    const known = new Set(docRef.current.bookmarks.map((b) => urlKey(b.url)));
    const fresh: Bookmark[] = [];
    let repeats = 0;
    const now = Date.now();
    for (const url of urls) {
      const key = urlKey(url);
      if (known.has(key)) {
        repeats += 1;
        continue;
      }
      known.add(key);
      fresh.push({
        id: newBookmarkId(),
        url,
        title: "",
        description: "",
        tags: [],
        folderId: scopeFolderId,
        favorite: scope.type === "favorites",
        // Keep paste order under "Newest first".
        createdAt: new Date(now + fresh.length).toISOString(),
        preview: null,
      });
    }
    if (fresh.length) {
      update((d) => ({ ...d, bookmarks: [...d.bookmarks, ...fresh] }));
      void loadPreviews(fresh.map((b) => b.id));
    }
    setNotice(
      repeats
        ? {
            tone: "info",
            text: `${repeats} ${repeats === 1 ? "link is" : "links are"} already saved.`,
          }
        : fresh.length
          ? {
              tone: "info",
              text: `Saved ${fresh.length} ${fresh.length === 1 ? "link" : "links"}.`,
            }
          : null,
    );
  };

  const openDialog = (next: Draft) => {
    setDialogKey((k) => k + 1);
    setDraft(next);
  };
  const openAdd = (url = "") =>
    openDialog({
      id: null,
      url,
      title: "",
      description: "",
      tags: activeTags,
      folderId: scopeFolderId,
      favorite: scope.type === "favorites",
      preview: null,
    });

  const saveDraft = (result: Draft) => {
    setDraft(null);
    if (result.id) {
      const { id: bookmarkId, ...patch } = result;
      const before = docRef.current.bookmarks.find((b) => b.id === bookmarkId);
      patchBookmark(bookmarkId, patch);
      if (before && before.url !== result.url && !result.preview) {
        void loadPreviews([bookmarkId]);
      }
      return;
    }
    const bookmark: Bookmark = {
      ...result,
      id: newBookmarkId(),
      createdAt: new Date().toISOString(),
    };
    update((d) => ({ ...d, bookmarks: [...d.bookmarks, bookmark] }));
    if (!bookmark.preview) void loadPreviews([bookmark.id]);
  };

  const deleteBookmark = (bookmark: Bookmark) => {
    const index = docRef.current.bookmarks.findIndex(
      (b) => b.id === bookmark.id,
    );
    update((d) => ({
      ...d,
      bookmarks: d.bookmarks.filter((b) => b.id !== bookmark.id),
    }));
    setNotice({
      tone: "info",
      text: `Deleted “${displayTitle(bookmark)}”.`,
      undo: () => {
        update((d) => {
          const bookmarks = [...d.bookmarks];
          bookmarks.splice(Math.min(index, bookmarks.length), 0, bookmark);
          return { ...d, bookmarks };
        });
        setNotice(null);
      },
    });
  };

  const copyLink = async (bookmark: Bookmark) => {
    try {
      await navigator.clipboard.writeText(bookmark.url);
      setCopiedId(bookmark.id);
      setTimeout(
        () =>
          setCopiedId((current) => (current === bookmark.id ? null : current)),
        1200,
      );
    } catch {
      setNotice({
        tone: "error",
        text: "The clipboard is not available here.",
      });
    }
  };

  /* ── Folders ──────────────────────────────────────────────────────── */

  const addFolder = (parentId: string | null) => {
    const folder = { id: newBookmarkId(), name: "New folder", parentId };
    update((d) => ({ ...d, folders: [...d.folders, folder] }));
    setRenamingId(folder.id);
  };
  const renameFolder = (folderId: string, value: string) => {
    setRenamingId(null);
    const clean = value.trim();
    if (!clean) return;
    update((d) => ({
      ...d,
      folders: d.folders.map((f) =>
        f.id === folderId ? { ...f, name: clean } : f,
      ),
    }));
  };
  const deleteFolder = (folderId: string) => {
    const d = docRef.current;
    const folder = d.folders.find((f) => f.id === folderId);
    if (!folder) return;
    const moved = d.bookmarks.filter((b) => b.folderId === folderId).length;
    update((current) => removeFolder(current, folderId));
    if (scope.type === "folder" && folderSubtree(d, folderId).has(scope.id)) {
      setScope(
        folder.parentId
          ? { type: "folder", id: folder.parentId }
          : { type: "all" },
      );
    }
    const target = folder.parentId
      ? folderPath(d, folder.parentId)
      : "Unsorted";
    setNotice({
      tone: "info",
      text: moved
        ? `Removed “${folder.name}” — ${moved} ${moved === 1 ? "bookmark" : "bookmarks"} moved to ${target}.`
        : `Removed “${folder.name}”.`,
    });
  };

  /** Drop of a card onto a sidebar entry. */
  const dropOn = (target: Scope, e: React.DragEvent) => {
    const bookmarkId = e.dataTransfer.getData(DRAG_TYPE);
    setDropTarget(null);
    if (!bookmarkId) return;
    e.preventDefault();
    e.stopPropagation();
    if (target.type === "favorites") {
      patchBookmark(bookmarkId, { favorite: true });
    } else if (target.type === "unsorted") {
      patchBookmark(bookmarkId, { folderId: null });
    } else if (target.type === "folder") {
      patchBookmark(bookmarkId, { folderId: target.id });
    }
  };
  const dropProps = (target: Scope, key: string) =>
    target.type === "all"
      ? {}
      : {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget(key);
          },
          onDragLeave: () =>
            setDropTarget((current) => (current === key ? null : current)),
          onDrop: (e: React.DragEvent) => dropOn(target, e),
        };

  /* ── Import / export ──────────────────────────────────────────────── */

  const importFile = async (file: File) => {
    try {
      const parsed = parseBookmarkHtml(await file.text(), scopeFolderId);
      const known = new Set(docRef.current.bookmarks.map((b) => urlKey(b.url)));
      const bookmarks = parsed.bookmarks.filter((b) => {
        const key = urlKey(b.url);
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      const skipped = parsed.bookmarks.length - bookmarks.length;
      if (!parsed.bookmarks.length) {
        setNotice({
          tone: "error",
          text: `No links found in ${file.name}. Export bookmarks from your browser as HTML and import that file.`,
        });
        return;
      }
      update((d) => ({
        ...d,
        folders: [...d.folders, ...parsed.folders],
        bookmarks: [...d.bookmarks, ...bookmarks],
      }));
      setNotice({
        tone: "info",
        text: `Imported ${bookmarks.length} ${bookmarks.length === 1 ? "bookmark" : "bookmarks"}${
          parsed.folders.length ? ` in ${parsed.folders.length} folders` : ""
        }${skipped ? ` · ${skipped} already saved` : ""}. Use “Previews” to fetch their pictures.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: `Could not read ${file.name}: ${(error as Error).message}`,
      });
    }
  };

  /* ── Derived view ─────────────────────────────────────────────────── */

  const tree = React.useMemo(() => folderTree(doc), [doc]);
  const folderCounts = React.useMemo(() => {
    const parents = new Map(doc.folders.map((f) => [f.id, f.parentId]));
    const counts = new Map<string, number>();
    for (const b of doc.bookmarks) {
      let at = b.folderId;
      for (let guard = 0; at && guard < 64; guard++) {
        counts.set(at, (counts.get(at) ?? 0) + 1);
        at = parents.get(at) ?? null;
      }
    }
    return counts;
  }, [doc]);
  const tagCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of doc.bookmarks) {
      for (const tag of b.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [doc]);
  const allTags = React.useMemo(
    () => tagCounts.map(([tag]) => tag),
    [tagCounts],
  );

  const visible = React.useMemo(() => {
    const inFolder =
      scope.type === "folder" ? folderSubtree(doc, scope.id) : null;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = doc.bookmarks.filter((b) => {
      if (scope.type === "favorites" && !b.favorite) return false;
      if (scope.type === "unsorted" && b.folderId) return false;
      if (inFolder && !(b.folderId && inFolder.has(b.folderId))) return false;
      if (!activeTags.every((tag) => b.tags.includes(tag))) return false;
      if (!words.length) return true;
      const haystack = [
        displayTitle(b),
        b.url,
        displayDescription(b),
        b.preview?.siteName ?? "",
        ...b.tags.map((t) => `#${t}`),
      ]
        .join(" ")
        .toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    return sortBookmarks(list, doc.sort);
  }, [doc, scope, activeTags, query]);

  const missingPreviews = doc.bookmarks.filter(
    (b) => !b.preview && !fetching.has(b.id),
  );
  const filtered = Boolean(query.trim() || activeTags.length);
  const scopeLabel =
    scope.type === "all"
      ? "All bookmarks"
      : scope.type === "favorites"
        ? "Favorites"
        : scope.type === "unsorted"
          ? "Unsorted"
          : folderPath(doc, scope.id) || "Folder";
  const toggleTag = (tag: string) =>
    setActiveTags((tags) =>
      tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag],
    );

  /* ── Pane-wide paste, drop and "/" ────────────────────────────────── */

  const onPaste = (e: React.ClipboardEvent) => {
    if (draft || isTyping(e.target)) return;
    const urls = urlsIn(e.clipboardData.getData("text"));
    if (!urls.length) return;
    e.preventDefault();
    quickAdd(urls);
  };
  const onDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes(DRAG_TYPE)) return;
    if (types.includes("text/uri-list") || types.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDropTarget("pane");
    }
  };
  const onDrop = (e: React.DragEvent) => {
    setDropTarget(null);
    if (e.dataTransfer.types.includes(DRAG_TYPE)) return;
    const urls = urlsIn(
      e.dataTransfer.getData("text/uri-list") ||
        e.dataTransfer.getData("text/plain"),
    );
    if (!urls.length) return;
    e.preventDefault();
    quickAdd(urls);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "/" && !isTyping(e.target) && !draft) {
      e.preventDefault();
      searchRef.current?.focus();
    }
  };

  const navItem = (
    target: Scope,
    key: string,
    label: string,
    icon: React.ReactNode,
    count: number,
  ) => {
    const selected =
      scope.type === target.type &&
      (target.type !== "folder" ||
        (scope.type === "folder" && scope.id === target.id));
    return (
      <button
        type="button"
        className={cn(
          "bookmark-pane__nav-item",
          selected && "bookmark-pane__nav-item--selected",
          dropTarget === key && "bookmark-pane__nav-item--drop",
        )}
        aria-current={selected || undefined}
        data-testid={`bookmark-pane-${key}-button`}
        onClick={() => setScope(target)}
        {...dropProps(target, key)}
      >
        {selected ? <NavHighlight /> : null}
        {icon}
        <span className="bookmark-pane__nav-label">{label}</span>
        <span className="bookmark-pane__nav-count">{count}</span>
      </button>
    );
  };

  return (
    <>
      <FileBarSlot>
        {missingPreviews.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ui.paneToolbarBtn}
            title={`Fetch website previews for ${Math.min(PREVIEW_BATCH, missingPreviews.length)} of the ${missingPreviews.length} bookmarks without one`}
            data-testid="bookmark-pane-previews-button"
            onClick={() =>
              void loadPreviews(
                missingPreviews.slice(0, PREVIEW_BATCH).map((b) => b.id),
              )
            }
          >
            <IconPhotoSearch aria-hidden className="pane-icon" />
            Previews ({missingPreviews.length})
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          title="Import a browser bookmarks file (bookmarks.html)"
          data-testid="bookmark-pane-import-button"
          onClick={() => importRef.current?.click()}
        >
          <IconUpload aria-hidden className="pane-icon" />
          Import
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".html,.htm,text/html"
          className="bookmark-pane__file-input"
          aria-hidden
          tabIndex={-1}
          data-testid="bookmark-pane-import-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(ui.paneToolbarBtn, "w-7 px-0 pointer-coarse:w-9")}
          data-active={doc.view === "grid" || undefined}
          aria-pressed={doc.view === "grid"}
          aria-label="Cards"
          data-testid="bookmark-pane-grid-view-button"
          onClick={() => update((d) => ({ ...d, view: "grid" }))}
        >
          <IconLayoutGrid aria-hidden className="pane-icon" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(ui.paneToolbarBtn, "w-7 px-0 pointer-coarse:w-9")}
          data-active={doc.view === "list" || undefined}
          aria-pressed={doc.view === "list"}
          aria-label="List"
          data-testid="bookmark-pane-list-view-button"
          onClick={() => update((d) => ({ ...d, view: "list" }))}
        >
          <IconLayoutList aria-hidden className="pane-icon" />
        </Button>
        <Button
          type="button"
          size="sm"
          className={ui.paneToolbarSolidBtn}
          data-testid="bookmark-pane-add-button"
          onClick={() => openAdd()}
        >
          <IconPlus aria-hidden className="pane-icon" />
          Add
        </Button>
      </FileBarSlot>

      <div
        className={cn(
          "bookmark-pane",
          dropTarget === "pane" && "bookmark-pane--dropping",
        )}
        tabIndex={-1}
        data-testid="bookmark-pane"
        onPaste={onPaste}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget(null);
          }
        }}
        onDrop={onDrop}
        onKeyDown={onKeyDown}
      >
        {/* Scopes the sliding selection pill to this pane. */}
        <LayoutGroup id={`bookmark-pane-${id}`}>
          <PaneSplit
            side="start"
            sideSize="14rem"
            sideMinSize={160}
            stackedSideSize="35%"
          >
            <aside className="bookmark-pane__side" aria-label="Collections">
              <nav className="bookmark-pane__nav">
                {navItem(
                  { type: "all" },
                  "all",
                  "All",
                  <IconBookmarks
                    aria-hidden
                    className="bookmark-pane__nav-icon"
                  />,
                  doc.bookmarks.length,
                )}
                {navItem(
                  { type: "favorites" },
                  "favorites",
                  "Favorites",
                  <IconStar aria-hidden className="bookmark-pane__nav-icon" />,
                  doc.bookmarks.filter((b) => b.favorite).length,
                )}
                {navItem(
                  { type: "unsorted" },
                  "unsorted",
                  "Unsorted",
                  <IconInbox aria-hidden className="bookmark-pane__nav-icon" />,
                  doc.bookmarks.filter((b) => !b.folderId).length,
                )}
              </nav>

              <section className="bookmark-pane__group" aria-label="Folders">
                <header className="bookmark-pane__group-head">
                  <h3 className="bookmark-pane__heading">Folders</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="bookmark-pane__group-button"
                    aria-label="New folder"
                    title="New folder"
                    data-testid="bookmark-pane-add-folder-button"
                    onClick={() => addFolder(null)}
                  >
                    <IconFolderPlus aria-hidden />
                  </Button>
                </header>
                {tree.length ? (
                  <ul
                    className="bookmark-pane__folders"
                    data-testid="bookmark-pane-folder-list"
                  >
                    {tree.map(({ folder, depth }) => (
                      <BookmarkFolderRow
                        key={folder.id}
                        id={folder.id}
                        name={folder.name}
                        depth={depth}
                        count={folderCounts.get(folder.id) ?? 0}
                        selected={
                          scope.type === "folder" && scope.id === folder.id
                        }
                        dropping={dropTarget === `folder-${folder.id}`}
                        renaming={renamingId === folder.id}
                        dropProps={dropProps(
                          { type: "folder", id: folder.id },
                          `folder-${folder.id}`,
                        )}
                        onSelect={() =>
                          setScope({ type: "folder", id: folder.id })
                        }
                        onAddChild={() => addFolder(folder.id)}
                        onRenameStart={() => setRenamingId(folder.id)}
                        onRename={(value) => renameFolder(folder.id, value)}
                        onRenameCancel={() => setRenamingId(null)}
                        onDelete={() => deleteFolder(folder.id)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="bookmark-pane__hint">No folders yet.</p>
                )}
              </section>

              {tagCounts.length ? (
                <section className="bookmark-pane__group" aria-label="Tags">
                  <header className="bookmark-pane__group-head">
                    <h3 className="bookmark-pane__heading">Tags</h3>
                  </header>
                  <ul
                    className="bookmark-pane__tags"
                    data-testid="bookmark-pane-tag-list"
                  >
                    {tagCounts.map(([tag, count]) => (
                      <li key={tag}>
                        <button
                          type="button"
                          className={cn(
                            "bookmark-pane__tag",
                            activeTags.includes(tag) &&
                              "bookmark-pane__tag--active",
                          )}
                          aria-pressed={activeTags.includes(tag)}
                          data-testid={`bookmark-pane-tag-${tag}-button`}
                          onClick={() => toggleTag(tag)}
                        >
                          #{tag}
                          <span className="bookmark-pane__tag-count">
                            {count}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>

            <main className="bookmark-pane__main">
              <header className="bookmark-pane__head">
                <div className="bookmark-pane__head-title">
                  <h2 className="bookmark-pane__title">{scopeLabel}</h2>
                </div>
                <div className="bookmark-pane__tools">
                  <div className="bookmark-pane__search-box">
                    <Input
                      ref={searchRef}
                      icon={Search}
                      className="bookmark-pane__search"
                      value={query}
                      placeholder="Search title, site, tag…"
                      aria-label="Search bookmarks"
                      aria-keyshortcuts="/"
                      data-testid="bookmark-pane-search-input"
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setSearchFocused(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setQuery("");
                          e.currentTarget.blur();
                        }
                      }}
                    />
                    {/* Shortcut hint; makes way for the clear button and the
                      caret once the field is in use. */}
                    {!query && !searchFocused ? (
                      <Kbd className="bookmark-pane__search-key" aria-hidden>
                        /
                      </Kbd>
                    ) : null}
                  </div>
                  <Select
                    value={doc.sort}
                    onValueChange={(value) =>
                      update((d) => ({ ...d, sort: value as BookmarkSort }))
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="bookmark-pane__sort"
                      aria-label="Sort bookmarks"
                      data-testid="bookmark-pane-sort-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                      {(Object.keys(SORT_LABEL) as BookmarkSort[]).map(
                        (sort) => {
                          const Icon = SORT_ICON[sort];
                          return (
                            <SelectItem key={sort} value={sort}>
                              <Icon
                                aria-hidden
                                className="bookmark-pane__sort-icon"
                              />
                              {SORT_LABEL[sort]}
                            </SelectItem>
                          );
                        },
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </header>

              <AnimatePresence initial={false}>
                {activeTags.length ? (
                  <Unfold
                    key="filters"
                    className="bookmark-pane__filters"
                    aria-label="Tag filters"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1, transition: enter }}
                    exit={{ height: 0, opacity: 0, transition: exit }}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {activeTags.map((tag) => (
                        <m.button
                          key={tag}
                          layout="position"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1, transition: quick }}
                          exit={{ opacity: 0, scale: 0.85, transition: exit }}
                          transition={{ layout: glide }}
                          type="button"
                          className="bookmark-pane__filter"
                          aria-label={`Stop filtering by #${tag}`}
                          data-testid={`bookmark-pane-active-tag-${tag}-button`}
                          onClick={() => toggleTag(tag)}
                        >
                          <IconTag
                            aria-hidden
                            className="bookmark-pane__filter-icon"
                          />
                          {tag}
                          <IconX
                            aria-hidden
                            className="bookmark-pane__filter-icon"
                          />
                        </m.button>
                      ))}
                    </AnimatePresence>
                  </Unfold>
                ) : null}
              </AnimatePresence>

              {parseError ? (
                <p
                  className="bookmark-pane__notice bookmark-pane__notice--error"
                  role="alert"
                  data-testid="bookmark-pane-parse-error-message"
                >
                  <IconAlertTriangle aria-hidden className="pane-icon" />
                  This file is not a valid bookmark list ({parseError}). Any
                  change replaces it.
                </p>
              ) : null}

              <AnimatePresence initial={false}>
                {notice ? (
                  <m.div
                    key="notice"
                    className={cn(
                      "bookmark-pane__notice",
                      notice.tone === "error" && "bookmark-pane__notice--error",
                    )}
                    role="status"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0, transition: enter }}
                    exit={{ opacity: 0, y: -6, transition: exit }}
                  >
                    <span
                      className="bookmark-pane__notice-text"
                      data-testid="bookmark-pane-notice-message"
                    >
                      {notice.text}
                    </span>
                    {notice.undo ? (
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        data-testid="bookmark-pane-notice-undo-button"
                        onClick={notice.undo}
                      >
                        Undo
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Dismiss"
                      data-testid="bookmark-pane-notice-dismiss-button"
                      onClick={() => setNotice(null)}
                    >
                      <IconX aria-hidden />
                    </Button>
                  </m.div>
                ) : null}
              </AnimatePresence>

              {visible.length ? (
                <ul
                  className={cn(
                    "bookmark-pane__list",
                    doc.view === "list" && "bookmark-pane__list--compact",
                  )}
                  data-testid="bookmark-pane-list"
                >
                  {/* Cards fade in, fade out, and the rest glide into place
                    when the scope, filter, search or sort changes. The first
                    paint staggers them in; later arrivals come straight in. */}
                  <AnimatePresence
                    initial={!listPainted.current}
                    mode="popLayout"
                  >
                    {visible.map((bookmark, index) => (
                      <m.li
                        key={bookmark.id}
                        className="bookmark-pane__item"
                        layout="position"
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: {
                            ...enter,
                            delay: listPainted.current
                              ? 0
                              : Math.min(index, 12) * 0.03,
                          },
                        }}
                        exit={{ opacity: 0, scale: 0.96, transition: exit }}
                        transition={{ layout: glide }}
                      >
                        <BookmarkCard
                          bookmark={bookmark}
                          compact={doc.view === "list"}
                          folder={
                            scope.type === "folder" &&
                            bookmark.folderId === scope.id
                              ? ""
                              : folderPath(doc, bookmark.folderId)
                          }
                          loading={fetching.has(bookmark.id)}
                          copied={copiedId === bookmark.id}
                          activeTags={activeTags}
                          onTag={toggleTag}
                          onFavorite={() =>
                            patchBookmark(bookmark.id, {
                              favorite: !bookmark.favorite,
                            })
                          }
                          onCopy={() => void copyLink(bookmark)}
                          onRefresh={() => void loadPreviews([bookmark.id])}
                          onEdit={() => openDialog({ ...bookmark })}
                          onDelete={() => deleteBookmark(bookmark)}
                        />
                      </m.li>
                    ))}
                  </AnimatePresence>
                </ul>
              ) : (
                <m.div
                  className="bookmark-pane__empty"
                  data-testid="bookmark-pane-empty-message"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={enter}
                >
                  {filtered ? (
                    <>
                      <p className="bookmark-pane__empty-text">
                        Nothing here matches your search.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="bookmark-pane-clear-filters-button"
                        onClick={() => {
                          setQuery("");
                          setActiveTags([]);
                        }}
                      >
                        Clear search and tags
                      </Button>
                    </>
                  ) : (
                    <>
                      <IconBookmarks
                        aria-hidden
                        className="bookmark-pane__empty-icon"
                      />
                      <p className="bookmark-pane__empty-text">
                        {doc.bookmarks.length
                          ? `No bookmarks in ${scopeLabel} yet.`
                          : "No bookmarks yet."}{" "}
                        Paste a link anywhere here, drop one from your browser,
                        or press Add.
                      </p>
                    </>
                  )}
                </m.div>
              )}
            </main>
          </PaneSplit>
        </LayoutGroup>
      </div>

      {draft ? (
        <BookmarkDialog
          key={dialogKey}
          draft={draft}
          doc={doc}
          allTags={allTags}
          onSave={saveDraft}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Fill behind the selected collection / folder. One shared layout element,
 * so selecting another entry slides it there instead of blinking.
 */
function NavHighlight() {
  return (
    <m.span
      aria-hidden
      layoutId="bookmark-nav-highlight"
      transition={glide}
      className="bookmark-pane__nav-highlight"
    />
  );
}

/* ───────────────────────────── Folder row ───────────────────────────── */

function BookmarkFolderRow({
  id,
  name,
  depth,
  count,
  selected,
  dropping,
  renaming,
  dropProps,
  onSelect,
  onAddChild,
  onRenameStart,
  onRename,
  onRenameCancel,
  onDelete,
}: {
  id: string;
  name: string;
  depth: number;
  count: number;
  selected: boolean;
  /** A card is being dragged over this folder. */
  dropping: boolean;
  renaming: boolean;
  dropProps: React.HTMLAttributes<HTMLElement>;
  onSelect: () => void;
  onAddChild: () => void;
  onRenameStart: () => void;
  onRename: (value: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  const testBase = `bookmark-folder-row-${id}`;
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const rowRef = React.useRef<HTMLLIElement>(null);
  // Actions show on the open folder, on hover and on keyboard focus; while
  // they do, the count steps aside and the name truncates before them.
  const revealed = selected || hovered || focused;
  // The rename field unmounts without a blur event; re-read where focus is.
  React.useEffect(() => {
    if (!renaming) {
      setFocused(
        Boolean(rowRef.current?.querySelector(":focus-visible")),
      );
    }
  }, [renaming]);
  return (
    <li
      ref={rowRef}
      className="bookmark-pane__folder"
      // Indent per nesting level — per-row geometry, not a style choice.
      style={{ "--depth": depth } as React.CSSProperties}
      data-testid={`${testBase}-item`}
      // Mouse only: a tap's emulated hover would stick on the row it hit.
      // On touch the actions show on the selected folder.
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setHovered(false);
      }}
      // Keyboard focus only: a tap or click focuses the button too, and
      // would otherwise leave this row's actions showing after it moves on.
      onFocus={(e) => setFocused(e.target.matches(":focus-visible"))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
      {renaming ? (
        <input
          className="bookmark-pane__folder-input"
          defaultValue={name}
          aria-label="Folder name"
          data-testid={`${testBase}-name-input`}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => onRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename(e.currentTarget.value);
            if (e.key === "Escape") onRenameCancel();
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className={cn(
              "bookmark-pane__nav-item",
              revealed && "bookmark-pane__nav-item--with-actions",
              selected && "bookmark-pane__nav-item--selected",
              dropping && "bookmark-pane__nav-item--drop",
            )}
            aria-current={selected || undefined}
            data-testid={`${testBase}-button`}
            onClick={onSelect}
            onDoubleClick={onRenameStart}
            {...dropProps}
          >
            {selected ? <NavHighlight /> : null}
            <IconFolder aria-hidden className="bookmark-pane__nav-icon" />
            <span className="bookmark-pane__nav-label">{name}</span>
            <span
              className={cn(
                "bookmark-pane__nav-count",
                revealed && "bookmark-pane__nav-count--hidden",
              )}
            >
              {count}
            </span>
          </button>
          <span
            className={cn(
              "bookmark-pane__folder-actions",
              revealed && "bookmark-pane__folder-actions--shown",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`New folder in ${name}`}
              title="New folder inside"
              data-testid={`${testBase}-add-button`}
              onClick={onAddChild}
            >
              <IconFolderPlus aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Rename ${name}`}
              title="Rename"
              data-testid={`${testBase}-rename-button`}
              onClick={onRenameStart}
            >
              <IconPencil aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="bookmark-pane__danger-button"
              aria-label={`Delete ${name}`}
              title="Delete folder (its bookmarks move up)"
              data-testid={`${testBase}-delete-button`}
              onClick={onDelete}
            >
              <IconTrash aria-hidden />
            </Button>
          </span>
        </>
      )}
    </li>
  );
}

/* ───────────────────────────── Card ───────────────────────────── */

/** Site icon, falling back to the first letter of the address. */
function SiteIcon({ bookmark }: { bookmark: Bookmark }) {
  const [broken, setBroken] = React.useState(false);
  const logo = bookmark.preview?.logo;
  if (logo && !broken) {
    return (
      <img
        className="bookmark-card__logo"
        src={logo}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="bookmark-card__monogram" aria-hidden>
      {hostOf(bookmark.url).charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function BookmarkCard({
  bookmark,
  compact,
  folder,
  loading,
  copied,
  activeTags,
  onTag,
  onFavorite,
  onCopy,
  onRefresh,
  onEdit,
  onDelete,
}: {
  bookmark: Bookmark;
  /** List view: one row, no picture. */
  compact: boolean;
  /** Folder path to show, `""` to hide it. */
  folder: string;
  /** Its preview is being fetched. */
  loading: boolean;
  copied: boolean;
  activeTags: string[];
  onTag: (tag: string) => void;
  onFavorite: () => void;
  onCopy: () => void;
  onRefresh: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [imageBroken, setImageBroken] = React.useState(false);
  const title = displayTitle(bookmark);
  const description = displayDescription(bookmark);
  const host = hostOf(bookmark.url);
  const href = httpUrl(bookmark.url) || undefined;
  const image = bookmark.preview?.image;
  const testBase = `bookmark-card-${bookmark.id}`;

  return (
    // The list item is the animated wrapper in the pane; HTML drag stays on
    // this plain element (motion claims `onDragStart` for its own gestures).
    <div
      className={cn(
        "bookmark-card",
        compact && "bookmark-card--compact",
        bookmark.favorite && "bookmark-card--favorite",
        loading && "bookmark-card--loading",
      )}
      draggable
      data-testid={`${testBase}-item`}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, bookmark.id);
        e.dataTransfer.setData("text/uri-list", bookmark.url);
        e.dataTransfer.setData("text/plain", bookmark.url);
        e.dataTransfer.effectAllowed = "copyMove";
      }}
    >
      {compact ? null : (
        <a
          className="bookmark-card__media"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          aria-hidden
          draggable={false}
        >
          {image && !imageBroken ? (
            <img
              className="bookmark-card__image"
              src={image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setImageBroken(true)}
            />
          ) : (
            <span className="bookmark-card__placeholder">
              {host.charAt(0).toUpperCase() || "?"}
            </span>
          )}
          {loading ? (
            <span className="bookmark-card__spinner">
              <IconLoader2
                aria-hidden
                className="bookmark-card__spinner-icon"
              />
            </span>
          ) : null}
        </a>
      )}

      <div className="bookmark-card__body">
        <div className="bookmark-card__site">
          {loading && compact ? (
            <IconLoader2 aria-hidden className="bookmark-card__spinner-icon" />
          ) : (
            <SiteIcon bookmark={bookmark} />
          )}
          <span className="bookmark-card__host">
            {bookmark.preview?.siteName || host}
          </span>
          {folder ? (
            <span className="bookmark-card__folder">
              <IconFolder aria-hidden className="bookmark-card__folder-icon" />
              {folder}
            </span>
          ) : null}
        </div>
        <a
          className="bookmark-card__title"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={bookmark.url}
          draggable={false}
          data-testid={`${testBase}-link`}
        >
          {title}
        </a>
        {description ? (
          <p className="bookmark-card__description">{description}</p>
        ) : null}
        {bookmark.tags.length ? (
          <ul className="bookmark-card__tags">
            {bookmark.tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className={cn(
                    "bookmark-card__tag",
                    activeTags.includes(tag) && "bookmark-card__tag--active",
                  )}
                  aria-pressed={activeTags.includes(tag)}
                  data-testid={`${testBase}-tag-${tag}-button`}
                  onClick={() => onTag(tag)}
                >
                  #{tag}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="bookmark-card__actions">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="bookmark-card__favorite"
          aria-label={
            bookmark.favorite ? "Remove from favorites" : "Add to favorites"
          }
          aria-pressed={bookmark.favorite}
          data-testid={`${testBase}-favorite-button`}
          onClick={onFavorite}
        >
          {/* Starring pops the icon; un-starring just swaps it. */}
          <AnimatePresence initial={false} mode="popLayout">
            <m.span
              key={bookmark.favorite ? "on" : "off"}
              className="bookmark-card__favorite-icon"
              initial={
                bookmark.favorite ? { scale: 0.4, rotate: -45 } : { opacity: 0 }
              }
              animate={{
                scale: 1,
                rotate: 0,
                opacity: 1,
                transition: bookmark.favorite
                  ? { type: "spring", stiffness: 520, damping: 14 }
                  : quick,
              }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
              {bookmark.favorite ? (
                <IconStarFilled aria-hidden />
              ) : (
                <IconStar aria-hidden />
              )}
            </m.span>
          </AnimatePresence>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Copy link"
          title="Copy link"
          data-testid={`${testBase}-copy-button`}
          onClick={onCopy}
        >
          {copied ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Fetch preview again"
          title="Fetch preview again"
          disabled={loading}
          data-testid={`${testBase}-refresh-button`}
          onClick={onRefresh}
        >
          <IconRefresh aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Edit"
          title="Edit"
          data-testid={`${testBase}-edit-button`}
          onClick={onEdit}
        >
          <IconPencil aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="bookmark-pane__danger-button"
          aria-label="Delete"
          title="Delete"
          data-testid={`${testBase}-delete-button`}
          onClick={onDelete}
        >
          <IconTrash aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Add / edit dialog ───────────────────────────── */

function BookmarkDialog({
  draft: initial,
  doc,
  allTags,
  onSave,
  onClose,
}: {
  draft: Draft;
  doc: BookmarkDoc;
  /** Tags used anywhere in the file — offered while typing. */
  allTags: string[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState(initial);
  const [tagText, setTagText] = React.useState("");
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const [previewState, setPreviewState] = React.useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);
  const tagListId = React.useId();
  const editing = Boolean(initial.id);
  const tree = React.useMemo(() => folderTree(doc), [doc]);

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const url = normalizeUrl(draft.url);
  const duplicate = url
    ? doc.bookmarks.find(
        (b) => b.id !== draft.id && urlKey(b.url) === urlKey(url),
      )
    : undefined;

  const commitTags = (text: string) => {
    const tags = normalizeTags([...draft.tags, ...text.split(",")]);
    patch({ tags });
    setTagText("");
  };

  const fetchPreview = async () => {
    if (!url) {
      setUrlError("Enter a web address first, such as example.com.");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPreviewState({ status: "loading" });
    try {
      const preview: BookmarkPreview = await fetchBookmarkPreview(
        url,
        controller.signal,
      );
      patch({ preview, url });
      setPreviewState({ status: "idle" });
    } catch (error) {
      if (controller.signal.aborted) return;
      setPreviewState({ status: "error", message: (error as Error).message });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      setUrlError("Enter a web address, such as https://example.com.");
      return;
    }
    const tags = normalizeTags([...draft.tags, ...tagText.split(",")]);
    // A changed address makes the old preview stale.
    const keepPreview =
      urlKey(url) === urlKey(initial.url) || draft.preview !== initial.preview;
    onSave({
      ...draft,
      url,
      tags,
      title: draft.title.trim(),
      description: draft.description.trim(),
      preview: keepPreview ? draft.preview : null,
    });
  };

  const preview = draft.preview;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bookmark-dialog" data-testid="bookmark-dialog">
        <form className="bookmark-dialog__form" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit bookmark" : "Add bookmark"}
            </DialogTitle>
            <DialogDescription className="bookmark-dialog__subtitle">
              Saved in this file. Previews are fetched through microlink.io.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="bookmark-dialog__body">
            <label className="bookmark-dialog__field">
              <span className="bookmark-dialog__label">Address</span>
              <Input
                value={draft.url}
                placeholder="https://example.com"
                autoFocus={!editing}
                inputMode="url"
                aria-invalid={urlError ? true : undefined}
                data-testid="bookmark-dialog-url-input"
                onChange={(e) => {
                  patch({ url: e.target.value });
                  setUrlError(null);
                }}
              />
            </label>
            {urlError ? (
              <p
                className="bookmark-dialog__message bookmark-dialog__message--error"
                role="alert"
                data-testid="bookmark-dialog-error-message"
              >
                {urlError}
              </p>
            ) : null}
            {duplicate ? (
              <p
                className="bookmark-dialog__message"
                data-testid="bookmark-dialog-duplicate-message"
              >
                Already saved as “{displayTitle(duplicate)}”
                {duplicate.folderId
                  ? ` in ${folderPath(doc, duplicate.folderId)}`
                  : ""}
                .
              </p>
            ) : null}

            <div
              className="bookmark-dialog__preview"
              data-testid="bookmark-dialog-preview-content"
            >
              {preview?.image ? (
                <img
                  className="bookmark-dialog__preview-image"
                  src={preview.image}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <div className="bookmark-dialog__preview-text">
                {preview ? (
                  <>
                    <span className="bookmark-dialog__preview-title">
                      {preview.title || "No title on the page"}
                    </span>
                    <span className="bookmark-dialog__preview-description">
                      {preview.description ||
                        preview.siteName ||
                        "No description on the page"}
                    </span>
                  </>
                ) : (
                  <span className="bookmark-dialog__preview-description">
                    {previewState.status === "error"
                      ? previewState.message
                      : editing
                        ? "No website preview yet."
                        : "A website preview is fetched when you save."}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="bookmark-dialog__preview-button"
                disabled={previewState.status === "loading"}
                data-testid="bookmark-dialog-preview-button"
                onClick={() => void fetchPreview()}
              >
                {previewState.status === "loading" ? (
                  <IconLoader2
                    aria-hidden
                    className="bookmark-card__spinner-icon"
                  />
                ) : (
                  <IconPhotoSearch aria-hidden />
                )}
                {preview ? "Refresh" : "Fetch"}
              </Button>
            </div>

            <label className="bookmark-dialog__field">
              <span className="bookmark-dialog__label">Title</span>
              <Input
                value={draft.title}
                placeholder={preview?.title || "Taken from the page"}
                data-testid="bookmark-dialog-title-input"
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
            <label className="bookmark-dialog__field">
              <span className="bookmark-dialog__label">Description</span>
              <textarea
                className="bookmark-dialog__textarea"
                value={draft.description}
                rows={3}
                placeholder={preview?.description || "Why you saved it"}
                data-testid="bookmark-dialog-description-input"
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>

            <div className="bookmark-dialog__row">
              <div className="bookmark-dialog__field">
                <span className="bookmark-dialog__label">Folder</span>
                <Select
                  value={draft.folderId ?? NO_FOLDER}
                  onValueChange={(value) =>
                    patch({ folderId: value === NO_FOLDER ? null : value })
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="bookmark-dialog__select"
                    aria-label="Folder"
                    data-testid="bookmark-dialog-folder-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FOLDER}>Unsorted</SelectItem>
                    {tree.map(({ folder }) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folderPath(doc, folder.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bookmark-dialog__favorite"
                data-active={draft.favorite || undefined}
                aria-pressed={draft.favorite}
                data-testid="bookmark-dialog-favorite-button"
                onClick={() => patch({ favorite: !draft.favorite })}
              >
                {draft.favorite ? (
                  <IconStarFilled aria-hidden />
                ) : (
                  <IconStar aria-hidden />
                )}
                Favorite
              </Button>
            </div>

            <div className="bookmark-dialog__field">
              <span className="bookmark-dialog__label">Tags</span>
              <span className="bookmark-dialog__tags">
                {draft.tags.map((tag) => (
                  <span key={tag} className="bookmark-dialog__tag">
                    #{tag}
                    <button
                      type="button"
                      className="bookmark-dialog__tag-remove"
                      aria-label={`Remove tag ${tag}`}
                      data-testid={`bookmark-dialog-tag-${tag}-remove-button`}
                      onClick={() =>
                        patch({ tags: draft.tags.filter((t) => t !== tag) })
                      }
                    >
                      <IconX
                        aria-hidden
                        className="bookmark-dialog__tag-icon"
                      />
                    </button>
                  </span>
                ))}
                <input
                  className="bookmark-dialog__tag-input"
                  value={tagText}
                  list={tagListId}
                  aria-label="Add tags"
                  placeholder={
                    draft.tags.length ? "" : "docs, design… (Enter or comma)"
                  }
                  data-testid="bookmark-dialog-tags-input"
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.includes(",")) commitTags(value);
                    else setTagText(value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagText.trim()) {
                      e.preventDefault();
                      commitTags(tagText);
                    } else if (
                      e.key === "Backspace" &&
                      !tagText &&
                      draft.tags.length
                    ) {
                      patch({ tags: draft.tags.slice(0, -1) });
                    }
                  }}
                />
                <datalist id={tagListId}>
                  {allTags
                    .filter((tag) => !draft.tags.includes(tag))
                    .map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                </datalist>
              </span>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid="bookmark-dialog-cancel-button"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="bookmark-dialog-save-button">
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
