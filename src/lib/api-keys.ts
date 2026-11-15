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

export function parseApiKeys(text: string): ApiKeysResult {
  if (!text.trim()) return { entries: [], problem: null };
  const parsed = parseData("json", text);
  if (!parsed.ok) return { entries: [], problem: parsed.problem };
  const value = parsed.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      entries: [],
      problem: {
        message: 'Expected an object: { "name": "api-key" }',
        line: 1,
        column: 1,
      },
    };
  }
  const entries: ApiKeyEntry[] = [];
  let problem: ParseProblem | null = null;
  for (const [name, key] of Object.entries(value)) {
    if (typeof key === "string") {
      entries.push({ name, key });
    } else if (!problem) {
      problem = {
        message: `"${name}" must be a string API key`,
        line: lineOfName(text, name),
        column: 1,
      };
    }
  }
  return { entries, problem };
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
