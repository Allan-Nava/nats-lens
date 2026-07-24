// Minimal, dependency-free JSON Schema validation (NL-17). Supports the
// common subset: type, required, properties, items, enum. Pure module,
// unit-tested. Deliberately not a full JSON Schema implementation — the
// runtime dependency policy is "nats only".

export interface JsonSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
}

export interface SchemaError {
  path: string;
  message: string;
}

function matchesType(v: unknown, t: NonNullable<JsonSchema['type']>): boolean {
  switch (t) {
    case 'string':
      return typeof v === 'string';
    case 'number':
      return typeof v === 'number';
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'object':
      return v !== null && typeof v === 'object' && !Array.isArray(v);
    case 'array':
      return Array.isArray(v);
    case 'null':
      return v === null;
    default:
      return true;
  }
}

/** Validates `value` against `schema`, returning a list of errors (empty = valid). */
export function validateJson(value: unknown, schema: JsonSchema, path = '$'): SchemaError[] {
  const errors: SchemaError[] = [];
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push({ path, message: `expected ${schema.type}` });
    return errors; // wrong type — deeper checks would be noise
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push({ path, message: `must be one of ${JSON.stringify(schema.enum)}` });
  }

  if (schema.type === 'object' && value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) errors.push({ path: `${path}.${req}`, message: 'required' });
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj) errors.push(...validateJson(obj[key], sub, `${path}.${key}`));
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((v, i) => errors.push(...validateJson(v, schema.items!, `${path}[${i}]`)));
  }

  return errors;
}
