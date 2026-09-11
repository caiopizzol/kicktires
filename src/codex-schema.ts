import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";

type Schema = Record<string, unknown>;
type Shape = { schema: Schema; decode: (value: unknown) => unknown; nullable: boolean };
const identity = (value: unknown) => value;
const scalarTypes = new Set(["string", "number", "integer", "boolean", "null"]);
const unsupported = [
  "$ref",
  "$defs",
  "definitions",
  "oneOf",
  "allOf",
  "not",
  "patternProperties",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "prefixItems",
];

function object(value: unknown): value is Schema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// The provider constrains representation; the original schema still validates values.
function shape(raw: unknown): Shape | undefined {
  if (!object(raw) || unsupported.some((key) => key in raw)) return;
  const metadata = typeof raw.description === "string" ? { description: raw.description } : {};
  if (Array.isArray(raw.anyOf)) {
    const variants = raw.anyOf.map(shape);
    if (variants.some((variant) => !variant || !scalarTypes.has(String(variant.schema.type))))
      return;
    return {
      schema: { ...metadata, anyOf: variants.map((variant) => variant!.schema) },
      decode: identity,
      nullable: variants.some((variant) => variant!.nullable),
    };
  }
  const values = Array.isArray(raw.enum) ? raw.enum : "const" in raw ? [raw.const] : undefined;
  const type =
    raw.type ??
    (values?.length && values.every((value) => typeof value === typeof values[0])
      ? values[0] === null
        ? "null"
        : typeof values[0]
      : undefined);
  if (type === "object") {
    if (raw.additionalProperties !== false || !object(raw.properties)) return;
    const required = new Set(Array.isArray(raw.required) ? raw.required : []);
    const properties: [string, Shape][] = [];
    for (const [key, value] of Object.entries(raw.properties)) {
      const child = shape(value);
      // A null sentinel cannot also represent an explicit nullable value.
      if (!child || (!required.has(key) && child.nullable)) return;
      properties.push([key, child]);
    }
    return {
      schema: {
        ...metadata,
        type,
        properties: Object.fromEntries(
          properties.map(([key, child]) => [
            key,
            required.has(key) || child.nullable
              ? child.schema
              : { anyOf: [child.schema, { type: "null" }] },
          ]),
        ),
        required: properties.map(([key]) => key),
        additionalProperties: false,
      },
      nullable: false,
      decode(value) {
        if (!object(value)) return value;
        const children = new Map(properties);
        return Object.fromEntries(
          Object.entries(value).flatMap(([key, entry]) => {
            const child = children.get(key);
            if (!child) return [[key, entry]];
            if (entry === null && !required.has(key) && !child.nullable) return [];
            return [[key, child.decode(entry)]];
          }),
        );
      },
    };
  }
  if (type === "array") {
    const items = shape(raw.items);
    if (!items) return;
    return {
      schema: { ...metadata, type, items: items.schema },
      nullable: false,
      decode: (value) => (Array.isArray(value) ? value.map(items.decode) : value),
    };
  }
  const types = Array.isArray(type) ? type : [type];
  if (!types.length || types.some((entry) => !scalarTypes.has(String(entry)))) return;
  return {
    schema: { ...metadata, type, ...(values ? { enum: values } : {}) },
    nullable: types.includes("null") && (!values || values.includes(null)),
    decode: identity,
  };
}

/** Unsupported schemas keep their original string representation and runtime validation. */
export function codexInputShape(schema: unknown): Shape | undefined {
  if (!object(schema) || schema.type !== "object") return;
  return shape(schema);
}

export function codexProposalSchema(options: LanguageModelV4CallOptions) {
  const variants = (options.tools ?? []).flatMap((tool) =>
    tool.type !== "function"
      ? []
      : [
          {
            type: "object" as const,
            properties: {
              name: { type: "string" as const, enum: [tool.name] },
              input: codexInputShape(tool.inputSchema)?.schema ?? {
                type: "string" as const,
                description: "JSON-encoded arguments for this tool",
              },
            },
            required: ["name", "input"],
            additionalProperties: false,
          },
        ],
  );
  return {
    type: "object" as const,
    properties: {
      toolCalls: {
        type: "array" as const,
        items: variants.length ? { anyOf: variants } : { type: "string" as const },
        maxItems: variants.length ? 20 : 0,
      },
      text: {
        type: "string" as const,
        description: "Final response, or empty when proposing tool calls",
      },
    },
    required: ["toolCalls", "text"],
    additionalProperties: false,
  };
}
