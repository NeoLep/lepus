// deno-lint-ignore-file no-explicit-any
import { OpenAI } from "openai/client.mjs";
import Client from "./client.ts";
import Memory from "./memory.ts";
import { BaseToolSchemas, ExecuteToolFunction } from "../tools/index.ts";
import Knowledge from "./knowledge.ts";
import Planner from "./planner.ts";
import pc from "picocolors";
import Executor from "./executor.ts";
import Validator from "./validator.ts";

export interface ChatResponse {
  choise: OpenAI.Chat.Completions.ChatCompletion.Choice;
  getContent: () => string | null | undefined;
  getResoning: () => string | null | undefined;
}
export type ChatMessages = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface AgentLoopResult {
  response: ChatResponse;
  messages: ChatMessages[];
}

export function toMessages(
  arr: ["system" | "user", string][],
): ChatMessages[] {
  return arr.map(([role, content]) => ({
    role,
    content,
  }));
}

export function getInput(messages: ChatMessages[]) {
  return typeof messages.at(-1)?.content === "string"
    ? messages.at(-1)!.content as string
    : "";
}

export class AgentRuntime {
  public client: Client;
  public memory: Memory;
  public knowledge: Knowledge = new Knowledge();
  public planner: Planner;
  public executor: Executor;
  public validator: Validator;

  constructor(
    private deps: {
      client: Client;
      knowledge?: Knowledge;
    },
  ) {
    this.client = deps.client;

    this.memory = new Memory(deps.client.chat);
    this.planner = new Planner(deps.client);
    this.executor = new Executor({
      runAgentLoop: this.runAgentLoop.bind(this),
      buildRuntimeMessages: this.buildRuntimeMessages.bind(this),
    });
    this.validator = new Validator({
      runAgentLoop: this.runAgentLoop,
    })
  }

  public async buildRuntimeMessages(
      messages: ChatMessages[],
    ): Promise<ChatMessages[]> {
    const result: ChatMessages[] = [];
    if (messages.length > 0) {
      result.push(
        ...await this.knowledge.buildMemory(
          getInput(messages)
        )
      );
    }

    result.push(...await this.memory.buildMemory());
    result.push(...messages);

    return result;
  }

  async saveConversation(messages: ChatMessages[], response: ChatResponse) {
    await this.memory.push(
      ...messages,
      response.choise.message,
    );
  }

  async chat(
    messages: ChatMessages[],
    responseCallback?: (response: ChatResponse) => void,
  ) {
    if (messages.length <= 0) {
      throw new Error("messages is required");
    }

    let result: AgentLoopResult;

    const router = await this.planner.shouldPlan(getInput(messages));
    if (router === 'plan') {
      const plan = await this.planner.createPlan(getInput(messages));
      const planNote = await this.executor.execute(plan, {
        responseCallback,
      });
      result = await this.runAgentLoop(
        await this.buildRuntimeMessages(
          toMessages([
            ["system", "根据执行结果生成最终回复。\n如果执行失败,请明确告诉用户失败原因。\n不要编造已经完成。"],
            ["user", JSON.stringify(planNote)],
          ]),
        ),
      );
    } else {
      result = await this.runAgentLoop(
        await this.buildRuntimeMessages(messages),
        {
          responseCallback,
          tools: BaseToolSchemas,
        },
      );
    }

    await this.saveConversation(
      messages,
      result.response,
    );

    return result;
  }

  async runAgentLoop(
    messages: ChatMessages[],
    options?: {
      tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
      responseCallback?: (response: ChatResponse) => void;
    },
  ): Promise<AgentLoopResult> {
    const { responseCallback, tools } = options ?? {};

    const runtimeMessages = [...messages];

    while (true) {
      const res = await this.client.llm.chat.completions.create({
        model: "deepseek-v4-flash",
        tools: tools ?? [],
        messages: runtimeMessages,
      }).catch((err) => {
        console.log(`Error Request`, err);
        console.log(pc.red(JSON.stringify(messages)));
        throw err;
      });

      const choise = res.choices[0];
      const message = choise.message;

      runtimeMessages.push(message);
      const response: ChatResponse = {
        choise,
        getContent: () => res.choices[0].message?.content,
        getResoning: () => (res.choices[0].message as any)?.reasoning_content,
      };
      responseCallback?.(response);
      if (!message.tool_calls?.length) {
        return {
          response,
          messages: runtimeMessages,
        };
      } else {
        console.log(pc.yellow(`used tools: [${message.tool_calls.map((call: any) => call.function?.name).join(', ')}]`))
        runtimeMessages.push(...await this.runTools(message.tool_calls)); // 一次性 push tool
      }
    }
  }

  private async runTools(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  ) {
    // tool batch
    const toolResults: ChatMessages[] = [];
    for (const call of toolCalls) {
      if (call.type !== "function") break;
      let result: any;
      try {
        result = await ExecuteToolFunction(
          call.function.name,
          JSON.parse(call.function.arguments),
        );
      } catch (err) {
        result = `工具执行失败: ${String(err)}`;
      }
      toolResults.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
    return toolResults;
  }
}
