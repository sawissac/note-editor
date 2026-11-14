import {
  type SchemaBuilderArrayItemType,
  type SchemaBuilderEnumValue,
  type SchemaBuilderFieldType,
  type SchemaBuilderProperty,
  type SchemaBuilderSchema,
  serializeSchema,
} from "@/components/extend/schema-builder";

/** Root keys of a JSON Schema document, kept as-is around the builder edits. */
export type SchemaRoot = Record<string, unknown>;

export type ParsedSchema =
  | { ok: true; schema: SchemaBuilderSchema; root: SchemaRoot }
  | { ok: false; error: string };

type Json = Record<string, unknown>;

const SCALARS = new Set(["string", "number", "integer", "boolean", "null"]);

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const newId = () => crypto.randomUUID();

/** `"type": ["string", "null"]` → `"string"`; missing → inferred. */
function typeOf(node: Json): string {
  const { type } = node;
  if (Array.isArray(type)) {
    return (type.find((t) => t !== "null") ?? type[0] ?? "string") as string;
  }
  if (typeof type === "string") return type;
  if (isObject(node.properties)) return "object";
  if (node.items !== undefined) return "array";
  if (Array.isArray(node.enum)) return "string";
  return "string";
}

function enumValues(node: Json): SchemaBuilderEnumValue[] {
  const descriptions = isObject(node.enumDescriptions) ? node.enumDescriptions : {};
  return (node.enum as unknown[]).map((value) => {
    const text = String(value);
    const description = descriptions[text];
    return {
      id: newId(),
      value: text,
      description: typeof description === "string" ? description : "",
    };
  });
}

function toProperties(properties: unknown): SchemaBuilderProperty[] {
  if (!isObject(properties)) return [];
  return Object.entries(properties).map(([key, node]) =>
    toProperty(key, isObject(node) ? node : {}),
  );
}

function toProperty(key: string, node: Json): SchemaBuilderProperty {
  const base = {
    id: newId(),
    key,
    description: typeof node.description === "string" ? node.description : "",
  };
  if (Array.isArray(node.enum)) {
    return { ...base, type: "enum", enumValues: enumValues(node) };
  }
  const type = typeOf(node);
  if (type === "object") {
    return { ...base, type: "object", properties: toProperties(node.properties) };
  }
  if (type === "array") {
    const items = isObject(node.items) ? node.items : {};
    const itemType = typeOf(items);
    let itemsOut: SchemaBuilderProperty["items"];
    if (Array.isArray(items.enum)) {
      itemsOut = { type: "enum", enumValues: enumValues(items) };
    } else if (itemType === "object") {
      itemsOut = { type: "object", properties: toProperties(items.properties) };
    } else {
      itemsOut = {
        type: (SCALARS.has(itemType) && itemType !== "null"
          ? itemType
          : "string") as SchemaBuilderArrayItemType,
      };
    }
    return { ...base, type: "array", items: itemsOut };
  }
  return {
    ...base,
    type: (SCALARS.has(type) ? type : "string") as SchemaBuilderFieldType,
  };
}

/**
 * Reads a JSON Schema file into the builder's model. Only `type: "object"`
 * roots are accepted; an empty file opens as an empty schema.
 */
export function parseSchemaText(text: string): ParsedSchema {
  if (!text.trim()) {
    return { ok: true, schema: { properties: [] }, root: { type: "object" } };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Invalid JSON — ${(error as Error).message}` };
  }
  if (!isObject(json) || typeOf(json) !== "object") {
    return { ok: false, error: 'The root must be an object schema ({ "type": "object", … }).' };
  }
  return { ok: true, schema: { properties: toProperties(json.properties) }, root: json };
}

/**
 * Writes the builder's model back as formatted JSON. Root keys other than
 * `type`/`properties` (`$schema`, `title`, `required`, …) are carried over;
 * keywords the builder has no field for are dropped from nested properties.
 */
export function stringifySchema(schema: SchemaBuilderSchema, root: SchemaRoot) {
  const { type, properties } = serializeSchema(schema);
  return `${JSON.stringify({ ...root, type, properties }, null, 2)}\n`;
}
