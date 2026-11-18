/**
 * `.prompt` files: a library of named system prompts for chats. A flat JSON
 * object — the key is the name shown in the chat's prompt list, the value is
 * the system prompt itself:
 *
 * ```json
 * { "Reviewer": "You are a strict code reviewer…", "Translator": "…" }
 * ```
 *
 * A chat stores only a reference (file id + name), so editing the text here
 * changes every chat that uses it.
 */
import { parseNamedStrings } from "@/lib/api-keys";
import type { ParseProblem } from "@/lib/data-formats";

export type PromptEntry = { name: string; text: string };

export function parsePrompts(text: string): {
  entries: PromptEntry[];
  problem: ParseProblem | null;
} {
  const { entries, problem } = parseNamedStrings(
    text,
    '{ "name": "system prompt" }',
    "prompt",
  );
  return {
    entries: entries.map((e) => ({ name: e.name, text: e.value })),
    problem,
  };
}

/** Content of a new `.prompt` file: one example to edit or replace. */
export const PROMPT_STARTER = `${JSON.stringify(
  {
    Concise: "You are a helpful assistant. Answer briefly and to the point.",
  },
  null,
  2,
)}\n`;

/**
 * `.prompt` file text with one entry added, renamed or rewritten. A renamed
 * entry keeps its place; a new one goes last.
 *
 * @throws When the file is not a JSON object, or `name` is taken by another
 *   entry.
 */
export function upsertPrompt(
  fileText: string,
  change: { oldName?: string; name: string; text: string },
) {
  const obj = promptObject(fileText);
  if (change.name !== change.oldName && change.name in obj) {
    throw new Error(`A prompt named “${change.name}” already exists.`);
  }
  const next: Record<string, unknown> = {};
  let placed = false;
  for (const [name, value] of Object.entries(obj)) {
    if (name === change.oldName) {
      next[change.name] = change.text;
      placed = true;
    } else {
      next[name] = value;
    }
  }
  if (!placed) next[change.name] = change.text;
  return `${JSON.stringify(next, null, 2)}\n`;
}

/** `.prompt` file text without the entry `name`. */
export function removePrompt(fileText: string, name: string) {
  const obj = promptObject(fileText);
  delete obj[name];
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function promptObject(fileText: string): Record<string, unknown> {
  if (!fileText.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(fileText);
  } catch {
    throw new Error(
      "The prompt file has a JSON error — fix it in the file first.",
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The prompt file must hold a JSON object.");
  }
  return { ...(value as Record<string, unknown>) };
}
