import z from "zod";
import { AgentRuntime, toMessages } from "./agent.ts";
import { PlanStep } from "./planner.ts";

const VALIDATOR_RESULT_SCHEMA = z.object({
  status: z.enum([
    "ok",
    "retry",
    "failed",
    "replan",
  ]),
  reason: z.string().optional(),
});
export type ValidatorResult = z.infer<typeof VALIDATOR_RESULT_SCHEMA>;

export default class Validator {
  constructor(
    private deps: {
      runAgentLoop: typeof AgentRuntime.prototype.runAgentLoop;
    },
  ) {
    this.deps = deps;
  }

  async validate(info: { goal: string; step: PlanStep[] }) {
    try {
      const res = await this.deps.runAgentLoop(
        toMessages([
            ["system", `你是一名任务验证器。\n请判断整个任务是否已经完成。并返回 JSON\n返回的数据格式为 ${JSON.stringify(VALIDATOR_RESULT_SCHEMA.toJSONSchema())}`],
          [
            "user",
            `任务目标: ${info.goal}
            ${
              info.step.map((step, index) => `步骤${index + 1}.${step.description}\n状态: ${step.status}\n结果: ${step.result}`)
                .join("\n")
            }`,
          ],
        ]),
      );
      return VALIDATOR_RESULT_SCHEMA.parse(res.response.getContent());
    } catch (error) {
      console.error(error);
    }
  }
}
