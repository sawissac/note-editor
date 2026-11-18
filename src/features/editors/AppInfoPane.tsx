import "@/styles/app-info-pane.css";
import {
  IconArrowsSort,
  IconExternalLink,
  IconPlayerPlay,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { FileIcon } from "@/lib/file-icons";
import {
  APP_FILES,
  CREATABLE_EXTENSIONS,
  EXTENSION_KINDS,
  type FileKind,
  KIND_LABEL,
} from "@/lib/file-types";
import { KIND_LIBRARIES } from "@/lib/kind-libraries";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";

/** One row in the list: a file type and every name that opens it. */
type Entry = {
  kind: FileKind;
  /** What opens it: `.md`, `.markdown`, `app.info`, … */
  labels: string[];
  /** Name handed to `FileIcon`, so the row gets the type's glyph + colour. */
  iconName: string;
};

const NAMED_FILE_KIND: Record<string, FileKind> = {
  [APP_FILES.info]: "appinfo",
  [APP_FILES.state]: "appstate",
};

/** Kind order follows `KIND_LABEL`, so "By type" matches the type list. */
const KIND_ORDER = Object.keys(KIND_LABEL) as FileKind[];

const ENTRIES: Entry[] = (() => {
  const byKind = new Map<FileKind, Entry>();
  const add = (kind: FileKind, label: string, iconName: string) => {
    const entry = byKind.get(kind);
    if (entry) entry.labels.push(label);
    else byKind.set(kind, { kind, labels: [label], iconName });
  };
  for (const { ext, kind } of EXTENSION_KINDS)
    add(kind, `.${ext}`, `file.${ext}`);
  for (const name of Object.values(APP_FILES)) {
    add(NAMED_FILE_KIND[name], name, name);
  }
  return [...byKind.values()];
})();

type Sort = "type" | "name";

/**
 * `app.info`: a read-only overview of what the app opens — one row per file
 * type with its tinted icon, the extensions that open it, and the
 * open-source libraries its editor is built on (linked to npm). Rows rise in
 * one by one; the file bar replays that and switches between grouped-by-type
 * and A→Z order. ⌘/Ctrl+S (and Download) write the list into the file as
 * JSON.
 *
 * Test ids: `app-info-pane`, `app-info-pane-list`, `app-info-pane-row-<kind>`,
 * `app-info-pane-replay-button`, `app-info-pane-sort-button`.
 *
 * CSS block: `app-info-pane` (`src/styles/app-info-pane.css`).
 */
export default function AppInfoPane({ id, registerSave }: PaneProps) {
  const dispatch = useAppDispatch();
  const [sort, setSort] = React.useState<Sort>("type");
  /** Bumped to remount the grid, which restarts its entrance animation. */
  const [replay, setReplay] = React.useState(0);

  useSaveHandler(registerSave, () =>
    dispatch(
      saveContent(
        id,
        `${JSON.stringify(
          {
            extensions: EXTENSION_KINDS.map(({ ext, kind }) => ({
              extension: ext,
              type: KIND_LABEL[kind],
              libraries: KIND_LIBRARIES[kind].map((lib) => lib.pkg),
            })),
            namedFiles: Object.values(APP_FILES),
            creatable: CREATABLE_EXTENSIONS,
          },
          null,
          2,
        )}\n`,
      ),
    ),
  );

  const visible = React.useMemo(() => {
    return sort === "name"
      ? [...ENTRIES].sort((a, b) =>
          KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind]),
        )
      : [...ENTRIES].sort(
          (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
        );
  }, [sort]);

  return (
    <>
      <FileBarSlot>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="app-info-pane-sort-button"
          title="Switch between grouped by type and A→Z"
          onClick={() => {
            setSort((s) => (s === "type" ? "name" : "type"));
            setReplay((n) => n + 1);
          }}
        >
          <IconArrowsSort aria-hidden className="pane-icon" />
          {sort === "type" ? "By type" : "A→Z"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="app-info-pane-replay-button"
          title="Play the list animation again"
          onClick={() => setReplay((n) => n + 1)}
        >
          <IconPlayerPlay aria-hidden className="pane-icon" />
          Replay
        </Button>
      </FileBarSlot>

      <div className="app-info-pane" data-testid="app-info-pane">
        <div className="app-info-pane__inner">
          <header className="app-info-pane__header">
            <h2 className="app-info-pane__title">What this app opens</h2>
            <p className="app-info-pane__lead">
              Every type below opens in its own editor, built on the libraries
              listed beside it. Create a file named{" "}
              <code className="app-info-pane__code">app.state</code> to watch
              the live store.
            </p>
          </header>

          <ul
            key={replay}
            className="app-info-pane__list"
            data-testid="app-info-pane-list"
            aria-label={`${visible.length} file types`}
          >
            {visible.map((entry, i) => {
              const libraries = KIND_LIBRARIES[entry.kind];
              return (
                <li
                  key={entry.kind}
                  className="app-info-pane__row"
                  style={{ "--app-info-pane-i": i } as React.CSSProperties}
                  data-testid={`app-info-pane-row-${entry.kind}`}
                >
                  <span className="app-info-pane__row-icon" aria-hidden>
                    <FileIcon name={entry.iconName} unsized />
                  </span>
                  <div className="app-info-pane__row-text">
                    <span className="app-info-pane__row-title">
                      {KIND_LABEL[entry.kind]}
                    </span>
                    <span className="app-info-pane__row-names">
                      {entry.labels.join("  ·  ")}
                    </span>
                  </div>
                  <ul
                    className="app-info-pane__libs"
                    aria-label={`${KIND_LABEL[entry.kind]} is built with`}
                  >
                    {libraries.length ? (
                      libraries.map((lib) => (
                        <li key={lib.pkg}>
                          <a
                            className="app-info-pane__lib"
                            href={`https://www.npmjs.com/package/${lib.pkg}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`${lib.pkg} on npm`}
                          >
                            {lib.name}
                            <IconExternalLink
                              aria-hidden
                              className="app-info-pane__lib-icon"
                            />
                          </a>
                        </li>
                      ))
                    ) : (
                      <li className="app-info-pane__lib app-info-pane__lib--builtin">
                        Built in
                      </li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
