import "@/styles/app-info-pane.css";
import { IconArrowsSort, IconPlayerPlay } from "@tabler/icons-react";
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
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";

/** One tile in the grid: an extension, or a constant file name. */
type Entry = {
  id: string;
  /** What the tile shows: `.md`, `app.info`, … */
  label: string;
  /** Name handed to `FileIcon`, so the tile gets the type's glyph + colour. */
  iconName: string;
  kind: FileKind;
};

const ENTRIES: Entry[] = [
  ...EXTENSION_KINDS.map(({ ext, kind }) => ({
    id: ext,
    label: `.${ext}`,
    iconName: `file.${ext}`,
    kind,
  })),
  ...Object.values(APP_FILES).map((name) => ({
    id: name.replace(".", "-"),
    label: name,
    iconName: name,
    kind: (name === APP_FILES.info ? "appinfo" : "appstate") as FileKind,
  })),
];

/** Kind order follows `KIND_LABEL`, so the grid groups like the type list. */
const KIND_ORDER = Object.keys(KIND_LABEL) as FileKind[];

type Sort = "type" | "name";

/**
 * `app.info`: a read-only overview of what the app opens — every extension
 * as a tile (big tinted type icon) in a staggered, animated grid. The file
 * bar replays the animation and switches
 * between grouped-by-type and A→Z order. ⌘/Ctrl+S (and Download) write the
 * list into the file as JSON.
 *
 * Test ids: `app-info-pane`, `app-info-pane-list`, `app-info-pane-card-<ext>`,
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
      ? [...ENTRIES].sort((a, b) => a.label.localeCompare(b.label))
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
          title="Play the grid animation again"
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
              Every extension below opens in its own editor. Create a file named{" "}
              <code className="app-info-pane__code">app.state</code> to watch
              the live store.
            </p>
          </header>

          <ul
            key={replay}
            className="app-info-pane__grid"
            data-testid="app-info-pane-list"
            aria-label={`${visible.length} extensions`}
          >
            {visible.map((entry, i) => (
              <li
                key={entry.id}
                className="app-info-pane__card"
                title={KIND_LABEL[entry.kind]}
                style={{ "--app-info-pane-i": i } as React.CSSProperties}
                data-testid={`app-info-pane-card-${entry.id}`}
              >
                <span className="app-info-pane__card-icon" aria-hidden>
                  <FileIcon name={entry.iconName} unsized />
                </span>
                <span className="app-info-pane__card-ext">{entry.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
