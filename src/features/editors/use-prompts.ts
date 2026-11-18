import * as React from "react";

import { parsePrompts, removePrompt, upsertPrompt } from "@/lib/prompts";
import { kindOf } from "@/lib/file-types";
import { storage } from "@/lib/storage";
import { addFileWithContent, saveContent } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { getPath } from "@/store/selectors";

/**
 * Named entries read from every workspace file `match` accepts, tagged with
 * the file they came from. `null` while the files are read. Re-reads when the
 * file tree changes (saving a file updates its node). Pass stable `match` /
 * `read` functions (module-level or memoised).
 */
export function useFileEntries<T>(
  match: (name: string) => boolean,
  read: (text: string) => T[],
) {
  const nodes = useAppSelector((s) => s.fs.nodes);
  const files = React.useMemo(
    () =>
      Object.values(nodes).filter((n) => n.type === "file" && match(n.name)),
    [nodes, match],
  );
  const [entries, setEntries] = React.useState<Array<
    T & { fileId: string; path: string }
  > | null>(null);
  React.useEffect(() => {
    let live = true;
    void Promise.all(
      files.map(async (file) => {
        const text = await storage.getContent(file.id).catch(() => null);
        const path = getPath(nodes, file.id).join("/");
        return read(typeof text === "string" ? text : "").map((e) => ({
          ...e,
          fileId: file.id,
          path,
        }));
      }),
    ).then((lists) => live && setEntries(lists.flat()));
    return () => {
      live = false;
    };
    // `nodes` only feeds the path labels; `files` changes with it anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);
  return { entries, files };
}

/** An entry of a `.prompt` file, tagged with where it lives. */
export type PromptChoice = {
  fileId: string;
  path: string;
  name: string;
  text: string;
};

/** A prompt being written: `fileId` + `oldName` when editing an entry. */
export type PromptDraft = {
  fileId?: string;
  oldName?: string;
  name: string;
  text: string;
};

const isPromptFile = (name: string) => kindOf(name) === "prompt";
const readPrompts = (text: string) =>
  parsePrompts(text).entries.map((e) => ({ name: e.name, text: e.text }));

/** Name of the `.prompt` file made for the first prompt saved from a chat. */
const NEW_PROMPT_FILE = "prompts.prompt";

/**
 * Every system prompt in the workspace's `.prompt` files, plus writers that
 * save an entry back into its file — or into the first `.prompt` file (made
 * at the root when there is none) for a new one.
 *
 * `prompts` is `null` while the files are read.
 */
export function usePromptLibrary() {
  const dispatch = useAppDispatch();
  const { entries, files } = useFileEntries(isPromptFile, readPrompts);

  const save = React.useCallback(
    async (draft: PromptDraft): Promise<PromptChoice> => {
      const name = draft.name.trim();
      if (!name) throw new Error("Give the prompt a name.");
      const targetId = draft.fileId ?? files[0]?.id;
      if (!targetId) {
        // No `.prompt` file yet: start one holding just this prompt.
        const text = upsertPrompt("{}", { name, text: draft.text });
        const node = await dispatch(
          addFileWithContent(NEW_PROMPT_FILE, null, text, { open: false }),
        );
        return { fileId: node.id, path: node.name, name, text: draft.text };
      }
      const current = await storage.getContent(targetId);
      const next = upsertPrompt(typeof current === "string" ? current : "", {
        oldName: draft.fileId ? draft.oldName : undefined,
        name,
        text: draft.text,
      });
      await dispatch(saveContent(targetId, next));
      const path =
        entries?.find((e) => e.fileId === targetId)?.path ?? NEW_PROMPT_FILE;
      return { fileId: targetId, path, name, text: draft.text };
    },
    [dispatch, entries, files],
  );

  const remove = React.useCallback(
    async (prompt: { fileId: string; name: string }) => {
      const current = await storage.getContent(prompt.fileId);
      const next = removePrompt(
        typeof current === "string" ? current : "",
        prompt.name,
      );
      await dispatch(saveContent(prompt.fileId, next));
    },
    [dispatch],
  );

  return {
    prompts: entries as PromptChoice[] | null,
    files,
    save,
    remove,
  };
}
