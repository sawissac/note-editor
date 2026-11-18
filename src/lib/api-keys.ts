/**
 * API-key stores: `.gemini` and `.openrouter` files. Each is a flat JSON
 * object — the key is a name you pick ("personal", "work"), the value is the
 * API key itself:
 *
 * ```json
 * { "personal": "AIza…", "work": "AIza…" }
 * ```
 */
import { parseData, type ParseProblem } from "@/lib/data-formats";

export type ApiKeyEntry = { name: string; key: string };

export type ApiKeysResult = {
  entries: ApiKeyEntry[];
  /** First problem found, with a 1-based line for the editor marker. */
  problem: ParseProblem | null;
};

/** 1-based line on which `"name"` is declared, for pointing at bad values. */
function lineOfName(text: string, name: string) {
  const at = text.indexOf(JSON.stringify(name));
  return at < 0 ? 1 : text.slice(0, at).split("\n").length;
}

/**
 * A flat JSON object of named strings — `{ "name": "value" }` — as entries.
 * Shared by API-key files and `.prompt` files.
 *
 * @param shape - The expected shape, quoted in the error for a non-object.
 * @param valueLabel - What a value is, for "must be a string …" errors.
 */
export function parseNamedStrings(
  text: string,
  shape: string,
  valueLabel: string,
): {
  entries: Array<{ name: string; value: string }>;
  problem: ParseProblem | null;
} {
  if (!text.trim()) return { entries: [], problem: null };
  const parsed = parseData("json", text);
  if (!parsed.ok) return { entries: [], problem: parsed.problem };
  const value = parsed.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      entries: [],
      problem: { message: `Expected an object: ${shape}`, line: 1, column: 1 },
    };
  }
  const entries: Array<{ name: string; value: string }> = [];
  let problem: ParseProblem | null = null;
  for (const [name, item] of Object.entries(value)) {
    if (typeof item === "string") {
      entries.push({ name, value: item });
    } else if (!problem) {
      problem = {
        message: `"${name}" must be a string ${valueLabel}`,
        line: lineOfName(text, name),
        column: 1,
      };
    }
  }
  return { entries, problem };
}

export function parseApiKeys(text: string): ApiKeysResult {
  const { entries, problem } = parseNamedStrings(
    text,
    '{ "name": "api-key" }',
    "API key",
  );
  return {
    entries: entries.map((e) => ({ name: e.name, key: e.value })),
    problem,
  };
}

export function serializeApiKeys(entries: readonly ApiKeyEntry[]) {
  const obj: Record<string, string> = {};
  for (const e of entries) obj[e.name] = e.key;
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** Every key replaced by bullets — safe for the PDF export. */
export function maskApiKeys(text: string) {
  const { entries, problem } = parseApiKeys(text);
  if (problem && !entries.length) return "(unreadable API-key file)";
  return serializeApiKeys(
    entries.map((e) => ({ name: e.name, key: e.key ? "••••••••" : "" })),
  );
}
