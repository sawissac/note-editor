/**
 * `.bookmark` files: a bookmark collection stored as JSON — links with a
 * title, description, tags and folder each, plus the website preview fetched
 * for them (see `@/lib/bookmark-preview`). Folders nest through `parentId`.
 */

export type BookmarkPreview = {
  title: string;
  description: string;
  /** Large preview picture (og:image), `""` when the site has none. */
  image: string;
  /** Site icon, `""` when none was found. */
  logo: string;
  siteName: string;
  /** ISO time of the fetch. */
  fetchedAt: string;
};

export type Bookmark = {
  id: string;
  url: string;
  title: string;
  description: string;
  /** Lower-case, unique, in the order they were added. */
  tags: string[];
  folderId: string | null;
  favorite: boolean;
  /** ISO time the bookmark was added. */
  createdAt: string;
  preview: BookmarkPreview | null;
};

export type BookmarkFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

export type BookmarkView = "grid" | "list";
export type BookmarkSort = "newest" | "oldest" | "title" | "site";

export type BookmarkDoc = {
  version: 1;
  folders: BookmarkFolder[];
  bookmarks: Bookmark[];
  view: BookmarkView;
  sort: BookmarkSort;
};

const SORTS: readonly BookmarkSort[] = ["newest", "oldest", "title", "site"];

export function newBookmarkId() {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyBookmarks(): BookmarkDoc {
  return {
    version: 1,
    folders: [],
    bookmarks: [],
    view: "grid",
    sort: "newest",
  };
}

/** Starter for a new `.bookmark` file: two folders, two links. */
export function starterBookmarks(): BookmarkDoc {
  const reading = { id: newBookmarkId(), name: "Reading", parentId: null };
  const tools = { id: newBookmarkId(), name: "Tools", parentId: null };
  const now = Date.now();
  return {
    ...emptyBookmarks(),
    folders: [reading, tools],
    bookmarks: [
      {
        id: newBookmarkId(),
        url: "https://developer.mozilla.org/",
        title: "MDN Web Docs",
        description:
          "Documentation for web developers: HTML, CSS and JavaScript.",
        tags: ["docs", "web"],
        folderId: reading.id,
        favorite: true,
        createdAt: new Date(now - 60_000).toISOString(),
        preview: null,
      },
      {
        id: newBookmarkId(),
        url: "https://caniuse.com/",
        title: "Can I use…",
        description: "Browser support tables for front-end web technologies.",
        tags: ["web", "compat"],
        folderId: tools.id,
        favorite: false,
        createdAt: new Date(now).toISOString(),
        preview: null,
      },
    ],
  };
}

export function serializeBookmarks(doc: BookmarkDoc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

function parsePreview(value: unknown): BookmarkPreview | null {
  if (typeof value !== "object" || value === null) return null;
  const p = value as Record<string, unknown>;
  return {
    title: str(p.title),
    description: str(p.description),
    image: httpUrl(p.image),
    logo: httpUrl(p.logo),
    siteName: str(p.siteName),
    fetchedAt: str(p.fetchedAt),
  };
}

/** Reads a `.bookmark` file. Bad entries are skipped, missing fields filled. */
export function parseBookmarks(text: string): BookmarkDoc {
  if (!text.trim()) return emptyBookmarks();
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Expected a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  const folders: BookmarkFolder[] = [];
  const folderIds = new Set<string>();
  for (const item of Array.isArray(obj.folders) ? obj.folders : []) {
    if (typeof item !== "object" || item === null) continue;
    const f = item as Record<string, unknown>;
    let id = str(f.id) || newBookmarkId();
    if (folderIds.has(id)) id = newBookmarkId();
    folderIds.add(id);
    folders.push({
      id,
      name: str(f.name) || "Untitled",
      parentId: str(f.parentId) || null,
    });
  }
  // Drop dangling parents and cycles: walk up; a repeat means a loop.
  for (const folder of folders) {
    if (folder.parentId && !folderIds.has(folder.parentId)) {
      folder.parentId = null;
    }
  }
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (const folder of folders) {
    const seen = new Set([folder.id]);
    let up = folder.parentId;
    while (up) {
      if (seen.has(up)) {
        folder.parentId = null;
        break;
      }
      seen.add(up);
      up = byId.get(up)?.parentId ?? null;
    }
  }

  const bookmarks: Bookmark[] = [];
  const ids = new Set<string>();
  for (const item of Array.isArray(obj.bookmarks) ? obj.bookmarks : []) {
    if (typeof item !== "object" || item === null) continue;
    const b = item as Record<string, unknown>;
    const url = str(b.url).trim();
    if (!url) continue;
    let id = str(b.id) || newBookmarkId();
    if (ids.has(id)) id = newBookmarkId();
    ids.add(id);
    const folderId = str(b.folderId);
    bookmarks.push({
      id,
      url,
      title: str(b.title),
      description: str(b.description),
      tags: normalizeTags(
        Array.isArray(b.tags)
          ? b.tags.filter((t) => typeof t === "string")
          : [],
      ),
      folderId: folderIds.has(folderId) ? folderId : null,
      favorite: b.favorite === true,
      createdAt: str(b.createdAt) || new Date(0).toISOString(),
      preview: parsePreview(b.preview),
    });
  }

  return {
    version: 1,
    folders,
    bookmarks,
    view: obj.view === "list" ? "list" : "grid",
    sort: SORTS.includes(obj.sort as BookmarkSort)
      ? (obj.sort as BookmarkSort)
      : "newest",
  };
}

/* ───────────────────────────── URLs & tags ───────────────────────────── */

/** `value` when it is an absolute http(s) URL, else `""`. */
export function httpUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

/**
 * Typed or pasted text → an http(s) URL, or null. `example.com/a` gains
 * `https://`; anything with spaces, or another scheme (`javascript:`,
 * `file:`), is refused so it never becomes a link.
 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text)
    ? text
    : /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(text) ||
        /^localhost(:\d+)?([/?#].*)?$/i.test(text)
      ? `https://${text}`
      : "";
  return httpUrl(withScheme) || null;
}

/** `https://www.example.com/a` → `example.com`. */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Key two URLs share when they point at the same page. */
export function urlKey(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}${u.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Trimmed, lower-cased, inner spaces → `-`, empty and repeats dropped. */
export function normalizeTags(tags: readonly string[]) {
  const out: string[] = [];
  for (const tag of tags) {
    const clean = tag
      .trim()
      .replace(/^#/, "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/** What a card shows as its heading. */
export function displayTitle(b: Bookmark) {
  return b.title.trim() || b.preview?.title.trim() || hostOf(b.url);
}

export function displayDescription(b: Bookmark) {
  return b.description.trim() || b.preview?.description.trim() || "";
}

/* ───────────────────────────── Folders ───────────────────────────── */

/** `folderId` and every folder nested under it. */
export function folderSubtree(doc: BookmarkDoc, folderId: string) {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of doc.folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** `Reading / Articles` — the folder's names from the top. */
export function folderPath(doc: BookmarkDoc, folderId: string | null) {
  const names: string[] = [];
  const byId = new Map(doc.folders.map((f) => [f.id, f]));
  let at = folderId ? byId.get(folderId) : undefined;
  while (at && names.length < 64) {
    names.unshift(at.name);
    at = at.parentId ? byId.get(at.parentId) : undefined;
  }
  return names.join(" / ");
}

/** Folders in tree order, each with its depth — for the sidebar and pickers. */
export function folderTree(doc: BookmarkDoc) {
  const children = new Map<string | null, BookmarkFolder[]>();
  for (const f of doc.folders) {
    const list = children.get(f.parentId) ?? [];
    list.push(f);
    children.set(f.parentId, list);
  }
  const out: Array<{ folder: BookmarkFolder; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    const list = [...(children.get(parentId) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    for (const folder of list) {
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * Removes a folder. Its bookmarks and sub-folders move up to its parent, so
 * nothing saved is lost.
 */
export function removeFolder(doc: BookmarkDoc, folderId: string): BookmarkDoc {
  const folder = doc.folders.find((f) => f.id === folderId);
  if (!folder) return doc;
  return {
    ...doc,
    folders: doc.folders
      .filter((f) => f.id !== folderId)
      .map((f) =>
        f.parentId === folderId ? { ...f, parentId: folder.parentId } : f,
      ),
    bookmarks: doc.bookmarks.map((b) =>
      b.folderId === folderId ? { ...b, folderId: folder.parentId } : b,
    ),
  };
}

/* ───────────────────────────── Sorting ───────────────────────────── */

export function sortBookmarks(list: Bookmark[], sort: BookmarkSort) {
  const copy = [...list];
  const byText = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base" });
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "title":
      return copy.sort((a, b) => byText(displayTitle(a), displayTitle(b)));
    case "site":
      return copy.sort(
        (a, b) =>
          byText(hostOf(a.url), hostOf(b.url)) ||
          byText(displayTitle(a), displayTitle(b)),
      );
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/* ─────────────────────── Netscape bookmark HTML ─────────────────────── */

/**
 * Bookmarks exported by a browser (Chrome, Firefox, Safari, Edge all write
 * the Netscape `bookmarks.html` format) → folders and bookmarks to merge
 * into `parentId`. Only http(s) links are kept — bookmarklets and
 * `place:` queries are skipped.
 */
export function parseBookmarkHtml(
  html: string,
  parentId: string | null,
): Pick<BookmarkDoc, "folders" | "bookmarks"> {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const folders: BookmarkFolder[] = [];
  const bookmarks: Bookmark[] = [];

  const items = (list: Element): Element[] =>
    [...list.children].flatMap((child) =>
      child.tagName === "P" ? items(child) : [child],
    );

  const walk = (list: Element, folderId: string | null) => {
    for (const item of items(list)) {
      if (item.tagName !== "DT") continue;
      const heading = item.querySelector(":scope > h3");
      const link = item.querySelector(":scope > a");
      if (heading) {
        const folder = {
          id: newBookmarkId(),
          name: heading.textContent?.trim() || "Untitled",
          parentId: folderId,
        };
        folders.push(folder);
        const inner = item.querySelector(":scope > dl");
        if (inner) walk(inner, folder.id);
      } else if (link) {
        const url = httpUrl(link.getAttribute("href"));
        if (!url) continue;
        const next = item.nextElementSibling;
        const added = Number(link.getAttribute("add_date"));
        bookmarks.push({
          id: newBookmarkId(),
          url,
          title: link.textContent?.trim() ?? "",
          description:
            next?.tagName === "DD" ? (next.textContent?.trim() ?? "") : "",
          tags: normalizeTags((link.getAttribute("tags") ?? "").split(",")),
          folderId,
          favorite: false,
          createdAt: new Date(
            Number.isFinite(added) && added > 0 ? added * 1000 : Date.now(),
          ).toISOString(),
          preview: null,
        });
      }
    }
  };

  const root = dom.querySelector("dl");
  if (root) walk(root, parentId);
  return { folders, bookmarks };
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The collection as a Netscape `bookmarks.html` any browser can import. */
export function toBookmarkHtml(doc: BookmarkDoc, title: string) {
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    `<TITLE>${escapeHtml(title)}</TITLE>`,
    `<H1>${escapeHtml(title)}</H1>`,
  ];
  const pad = (depth: number) => "    ".repeat(depth);
  const writeList = (folderId: string | null, depth: number) => {
    lines.push(`${pad(depth)}<DL><p>`);
    const folders = doc.folders
      .filter((f) => f.parentId === folderId)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const folder of folders) {
      lines.push(`${pad(depth + 1)}<DT><H3>${escapeHtml(folder.name)}</H3>`);
      writeList(folder.id, depth + 1);
    }
    for (const b of doc.bookmarks.filter((x) => x.folderId === folderId)) {
      const added = Math.floor(Date.parse(b.createdAt) / 1000) || 0;
      const tags = b.tags.length
        ? ` TAGS="${escapeHtml(b.tags.join(","))}"`
        : "";
      lines.push(
        `${pad(depth + 1)}<DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${added}"${tags}>${escapeHtml(displayTitle(b))}</A>`,
      );
      const description = displayDescription(b);
      if (description) {
        lines.push(`${pad(depth + 1)}<DD>${escapeHtml(description)}`);
      }
    }
    lines.push(`${pad(depth)}</DL><p>`);
  };
  writeList(null, 0);
  return `${lines.join("\n")}\n`;
}

/* ───────────────────────────── Export table ───────────────────────────── */

export const BOOKMARK_TABLE_HEADER = [
  "Title",
  "URL",
  "Folder",
  "Tags",
  "Description",
  "Added",
];

/** One row per bookmark, folders as paths — for CSV, Markdown and PDF. */
export function bookmarkRows(doc: BookmarkDoc) {
  return doc.bookmarks.map((b) => [
    displayTitle(b),
    b.url,
    folderPath(doc, b.folderId),
    b.tags.join(", "),
    displayDescription(b),
    b.createdAt.slice(0, 10),
  ]);
}
