// deno-lint-ignore-file no-explicit-any
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod";
import * as BaseTools from "./base.ts";
import * as PrivateTools from "./private.ts";

export type Tool<T extends z.ZodTypeAny = z.ZodTypeAny> = {
  schema: ChatCompletionTool;
  validator?: T;
  executor: (args: z.infer<T>) => Promise<unknown> | unknown;
};

export function createFunctionTool<T extends z.ZodTypeAny>(params: {
  name: string;
  description: string;
  executor: Tool<T>["executor"];
  validator?: T;
}): Tool<T> {
  const { name, description, validator, executor } = params;
  const r: Tool<T> = {
    schema: {
      type: "function",
      function: {
        name,
        description,
        parameters: z.toJSONSchema(validator || z.object({})),
      },
    },
    validator,
    executor,
  };
  return r;
}

export const Tools: Tool[] = [
  ...Object.values(BaseTools).filter((i) => !!i),
  ...Object.values(PrivateTools).filter((i) => !!i),
];
export const BaseToolSchemas = Object.values(BaseTools).filter((
  item,
): item is Tool => !!item).map((tool) => tool.schema);
export const BaseToolNames = BaseToolSchemas.map((tool) =>
  tool.type === "function" ? tool.function.name : ""
).filter(Boolean);
const ToolSchemaMap = (() => {
  const dict: Record<string, ChatCompletionTool> = {};
  Tools.forEach((item) => {
    if (item.schema.type === "function") {
      dict[item.schema.function.name] = item.schema;
    }
  });
  return dict;
})();
const ToolFuncs = (() => {
  const dict: Record<string, (...args: unknown[]) => unknown> = {};
  Tools.forEach((item) => {
    if (item.schema.type === "function") {
      dict[item.schema.function.name] = item.executor;
    }
  });
  return dict;
})();

export const ToolSchemas = Tools.map((tool) => tool.schema);

export function getToolSchemasByNames(names?: string[]) {
  if (!names?.length) {
    return ToolSchemas;
  }
  return names
    .map((name) => ToolSchemaMap[name])
    .filter((tool): tool is ChatCompletionTool => !!tool);
}
export const ExecuteToolFunction = (name: string, args: any) => {
  if (name in ToolFuncs) {
    return ToolFuncs[name](args);
  } else {
    return `未找到工具 ${name}`;
  }
};
