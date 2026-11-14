import * as React from "react";

import { CsvViewer } from "@/components/extend/csv-viewer";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { type TabMode, tabsActions } from "@/store/tabs-slice";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import { useDebouncedSave } from "@/features/editors/use-file-content";
import { type PaneProps, useSaveHandler } from "@/features/editors/pane-context";

/** CSV: a searchable grid in view mode, the raw text in edit mode. */
export default function CsvPane({
  id,
  content,
  mode,
  autoFocus,
  registerSave,
}: PaneProps & { mode: TabMode }) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(typeof content === "string" ? content : "");
  const [focusOnMount] = React.useState(autoFocus);
  const save = useDebouncedSave((value) => void dispatch(saveContent(id, value)));
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));

  // A brand-new CSV has nothing to tabulate — start it in the raw editor.
  React.useEffect(() => {
    if (mode === "view" && !text.trim()) {
      dispatch(tabsActions.modeSet({ id, mode: "edit" }));
    }
    // Only on open; later switches to an empty table are deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === "view") {
    return <CsvViewer className="h-full" data={text} search />;
  }
  return (
    <LazyCodeEditor
      path={`${id}.csv`}
      language="csv"
      aria-label="Raw CSV"
      data-testid="csv-raw-editor"
      placeholder={"Type comma-separated rows, e.g.\nname,role,started\nAda,Engineer,2021-03-01"}
      autoFocus={focusOnMount}
      defaultValue={text}
      onChange={(value) => {
        setText(value);
        save(value);
      }}
    />
  );
}
