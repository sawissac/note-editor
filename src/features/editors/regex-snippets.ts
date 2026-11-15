/**
 * What the regex input's autocomplete offers, and the ready-made patterns the
 * pane lists under Suggestions.
 *
 * `insert` is a Monaco snippet: `$0` / `${1:placeholder}` are tab stops, and a
 * literal `\`, `$` or `}` is written `\\`, `\$`, `\}` — {@link lit} does that
 * for plain text.
 */

export type RegexSnippetGroup =
  "escape" | "class" | "group" | "quantifier" | "anchor" | "pattern";

export type RegexSnippet = {
  /** What the list shows, and what typed text is matched against. */
  label: string;
  detail: string;
  insert: string;
  group: RegexSnippetGroup;
};

/** Plain text → snippet body that inserts it verbatim. */
export function lit(text: string) {
  return text.replace(/[\\$}]/g, "\\$&");
}

const make =
  (group: RegexSnippetGroup) =>
  (label: string, detail: string, insert = lit(label)): RegexSnippet => ({
    label,
    detail,
    insert,
    group,
  });

const escape = make("escape");
const klass = make("class");
const group = make("group");
const quantifier = make("quantifier");
const anchor = make("anchor");

/** A ready-made pattern; `flags` are switched on when it is applied. */
export type RegexRecipe = {
  id: string;
  name: string;
  pattern: string;
  flags?: string;
};

export const REGEX_RECIPES: RegexRecipe[] = [
  {
    id: "email",
    name: "Email address",
    pattern: "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+",
  },
  { id: "url", name: "URL", pattern: "https?:\\/\\/[^\\s/$.?#][^\\s]*" },
  {
    id: "ipv4",
    name: "IPv4 address",
    pattern:
      "\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b",
  },
  {
    id: "date",
    name: "Date (YYYY-MM-DD)",
    pattern: "\\b\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])\\b",
  },
  {
    id: "time",
    name: "Time (24h)",
    pattern: "\\b(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b",
  },
  {
    id: "hex-color",
    name: "Hex color",
    pattern: "#(?:[0-9a-fA-F]{3}){1,2}\\b",
  },
  {
    id: "uuid",
    name: "UUID",
    pattern:
      "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b",
    flags: "i",
  },
  { id: "integer", name: "Whole number", pattern: "-?\\b\\d+\\b" },
  {
    id: "decimal",
    name: "Decimal number",
    pattern: "-?\\b\\d+(?:\\.\\d+)?\\b",
  },
  { id: "phone", name: "Phone number", pattern: "\\+?\\d[\\d\\s().-]{7,}\\d" },
  { id: "slug", name: "URL slug", pattern: "\\b[a-z0-9]+(?:-[a-z0-9]+)*\\b" },
  { id: "html-tag", name: "HTML tag", pattern: "<\\/?[a-zA-Z][^>]*>" },
  { id: "quoted", name: "Quoted string", pattern: '"(?:[^"\\\\]|\\\\.)*"' },
  {
    id: "repeated-word",
    name: "Repeated word",
    pattern: "\\b(\\w+)\\s+\\1\\b",
    flags: "i",
  },
  { id: "blank-line", name: "Blank line", pattern: "^\\s*$", flags: "m" },
  {
    id: "trailing-space",
    name: "Trailing spaces",
    pattern: "[ \\t]+$",
    flags: "m",
  },
];

export const REGEX_SNIPPETS: RegexSnippet[] = [
  // Escapes — offered after `\`.
  escape("\\d", "Digit, 0–9"),
  escape("\\w", "Word character — letter, digit or _"),
  escape("\\s", "Whitespace — space, tab, line break"),
  escape("\\b", "Word boundary"),
  escape("\\D", "Anything but a digit"),
  escape("\\W", "Anything but a word character"),
  escape("\\S", "Anything but whitespace"),
  escape("\\B", "Not a word boundary"),
  escape("\\.", "A real dot"),
  escape("\\n", "Line break"),
  escape("\\t", "Tab"),
  escape("\\r", "Carriage return"),
  escape("\\\\", "A real backslash"),
  escape("\\/", "A real slash"),
  escape("\\1", "The same text group 1 matched"),
  escape(
    "\\k<name>",
    "The same text a named group matched",
    "\\\\k<${1:name}>",
  ),
  escape("\\p{L}", "Any letter, any script (u flag)"),
  escape("\\p{Lu}", "Uppercase letter (u flag)"),
  escape("\\p{Ll}", "Lowercase letter (u flag)"),
  escape("\\p{N}", "Any numeric character (u flag)"),
  escape("\\p{P}", "Punctuation (u flag)"),
  escape("\\p{…}", "Unicode property (u flag)", "\\\\p{${1:Script=Greek}\\}"),
  escape("\\P{…}", "Not a Unicode property (u flag)", "\\\\P{${1:L}\\}"),
  escape("\\uFFFF", "Character by 4-digit hex code", "\\\\u${1:00E9}"),
  escape("\\u{…}", "Character by code point (u flag)", "\\\\u{${1:1F600}\\}"),
  escape("\\xFF", "Character by 2-digit hex code", "\\\\x${1:41}"),

  // Character classes — offered after `[`.
  klass("[abc]", "Any one of the listed characters", "[${1:abc}]"),
  klass("[^abc]", "Any character that is not listed", "[^${1:abc}]"),
  klass("[a-z]", "Lowercase letter"),
  klass("[A-Z]", "Uppercase letter"),
  klass("[0-9]", "Digit"),
  klass("[a-zA-Z]", "Letter"),
  klass("[a-zA-Z0-9_]", "Letter, digit or underscore"),
  klass("[\\s\\S]", "Any character, line breaks included"),

  // Groups — offered after `(`.
  group("(…)", "Capture group", "($0)"),
  group("(?:…)", "Group without capturing", "(?:$0)"),
  group("(?<name>…)", "Named capture group", "(?<${1:name}>$0)"),
  group("(?=…)", "Lookahead — followed by", "(?=$0)"),
  group("(?!…)", "Negative lookahead — not followed by", "(?!$0)"),
  group("(?<=…)", "Lookbehind — preceded by", "(?<=$0)"),
  group("(?<!…)", "Negative lookbehind — not preceded by", "(?<!$0)"),
  group("(a|b)", "Either one or the other", "(${1:a}|${2:b})"),

  // Quantifiers — offered after `{`.
  quantifier("{n}", "Exactly n times", "{${1:3}\\}"),
  quantifier("{n,}", "n or more times", "{${1:2},\\}"),
  quantifier("{n,m}", "Between n and m times", "{${1:2},${2:5}\\}"),
  quantifier("*", "0 or more times"),
  quantifier("+", "1 or more times"),
  quantifier("?", "Optional — 0 or 1 time"),
  quantifier("*?", "0 or more, as few as possible"),
  quantifier("+?", "1 or more, as few as possible"),

  anchor("^", "Start of the text (of a line with m)"),
  anchor("$", "End of the text (of a line with m)"),
  anchor(".", "Any character except a line break"),
  anchor("|", "Or"),

  ...REGEX_RECIPES.map((recipe): RegexSnippet => ({
    label: recipe.name,
    detail: recipe.pattern,
    insert: lit(recipe.pattern),
    group: "pattern",
  })),
];
