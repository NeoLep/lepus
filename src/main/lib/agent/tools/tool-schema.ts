import { z } from 'zod'

type JsonSchema = Record<string, unknown>

function compile(schema: JsonSchema): z.ZodType {
  let result: z.ZodType
  if (Array.isArray(schema.enum)) {
    const values = schema.enum
    result = z.union(
      values.map((value) => z.literal(value)) as [z.ZodLiteral, z.ZodLiteral, ...z.ZodLiteral[]]
    )
  } else if (schema.type === 'object') {
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
    const required = new Set(Array.isArray(schema.required) ? schema.required : [])
    const shape: Record<string, z.ZodType> = {}
    for (const [key, value] of Object.entries(properties)) {
      const field = compile(value)
      shape[key] = required.has(key) ? field : field.optional()
    }
    result = z.object(shape).strict()
  } else if (schema.type === 'array') {
    result = z.array(compile((schema.items ?? {}) as JsonSchema))
    if (typeof schema.minItems === 'number') result = (result as z.ZodArray).min(schema.minItems)
    if (typeof schema.maxItems === 'number') result = (result as z.ZodArray).max(schema.maxItems)
  } else if (schema.type === 'integer') {
    let numberSchema = z.number().int()
    if (typeof schema.minimum === 'number') numberSchema = numberSchema.min(schema.minimum)
    if (typeof schema.maximum === 'number') numberSchema = numberSchema.max(schema.maximum)
    result = numberSchema
  } else if (schema.type === 'number') {
    let numberSchema = z.number()
    if (typeof schema.minimum === 'number') numberSchema = numberSchema.min(schema.minimum)
    if (typeof schema.maximum === 'number') numberSchema = numberSchema.max(schema.maximum)
    result = numberSchema
  } else if (schema.type === 'boolean') {
    result = z.boolean()
  } else {
    let stringSchema = z.string()
    if (typeof schema.minLength === 'number') stringSchema = stringSchema.min(schema.minLength)
    if (typeof schema.maxLength === 'number') stringSchema = stringSchema.max(schema.maxLength)
    result = stringSchema
  }
  return typeof schema.description === 'string' ? result.describe(schema.description) : result
}

export function compileToolParameters(schema: JsonSchema): z.ZodType<Record<string, unknown>> {
  return compile(schema) as z.ZodType<Record<string, unknown>>
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : '参数'}: ${issue.message}`)
    .join('；')
}
