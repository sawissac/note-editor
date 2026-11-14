import * as React from "react";

import {
  type SchemaBuilderSchema,
  SchemaBuilderPanel,
} from "@/components/extend/schema-builder";
import { type ParsedSchema, parseSchemaText, stringifySchema } from "@/lib/json-schema";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { type TabMode, tabsActions } from "@/store/tabs-slice";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import { useDebouncedSave } from "@/features/editors/use-file-content";
import { type PaneProps, useSaveHandler } from "@/features/editors/pane-context";

/**
 * JSON Schema: the Extend schema builder in view mode, the raw JSON in edit
 * mode. The text is the source of truth; it is re-parsed into the builder
 * whenever the raw editor changed it, and the builder writes back to it.
 */
export default function SchemaPane({
  id,
  content,
  mode,
  isDark,
  autoFocus,
  registerSave,
}: PaneProps & { mode: TabMode }) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(typeof content === "string" ? content : "");
  const [focusOnMount] = React.useState(autoFocus);
  const save = useDebouncedSave((value) => void dispatch(saveContent(id, value)));
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));

  // Parsed builder model, tagged with the text it came from so builder edits
  // (which update both) never trigger a re-parse that would reset row ids.
  const [parsed, setParsed] = React.useState<{ text: string; result: ParsedSchema } | null>(
    null,
  );
  let current = parsed;
  if (mode === "view" && current?.text !== text) {
    current = { text, result: parseSchemaText(text) };
    setParsed(current);
  }

  const onSchemaChange = (schema: SchemaBuilderSchema) => {
    if (!current?.result.ok) return;
    const next = stringifySchema(schema, current.result.root);
    setText(next);
    setParsed({ text: next, result: { ...current.result, schema } });
    save(next);
  };

  if (mode === "view" && current) {
    if (!current.result.ok) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p
            data-testid="schema-pane-error-message"
            className="max-w-md font-description text-[12px] text-app-error"
          >
            {current.result.error}
          </p>
          <button
            type="button"
            data-testid="schema-pane-raw-button"
            className={ui.ghostBtn}
            onClick={() => dispatch(tabsActions.modeSet({ id, mode: "edit" }))}
          >
            Fix in raw editor
          </button>
        </div>
      );
    }
    return (
      <div data-testid="schema-pane-builder-content" className="h-full">
        <SchemaBuilderPanel
          className="h-full"
          schema={current.result.schema}
          onSchemaChange={onSchemaChange}
          theme={isDark ? "dark" : "light"}
        />
      </div>
    );
  }

  return (
    <LazyCodeEditor
      path={`${id}.schema.json`}
      language="json"
      aria-label="Raw JSON Schema"
      data-testid="schema-pane-raw-input"
      placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
      autoFocus={focusOnMount}
      defaultValue={text}
      onChange={(value) => {
        setText(value);
        save(value);
      }}
    />
  );
}
