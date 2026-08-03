import { BaseToolSchemas } from "../tools/index.ts";
import {
  AgentRuntime,
  ChatMessages,
  ChatResponse,
  toMessages,
} from "./agent.ts";
import { Plan, PlanStep } from "./planner.ts";

export default class Executor {
  public maxRetryCount = 3
  constructor(
    private runtime: Pick<
      AgentRuntime,
      "runAgentLoop" | "buildRuntimeMessages"
    >,
  ) { }

  async execute(
    plan: Plan,
    options?: {
      responseCallback?: (response: ChatResponse) => void
      retry?: number
    },
  ) {
    console.log(`[planner] ${plan.goal}`);
    for (const step of plan.steps) {
      console.log(`  ${step.id}. ${step.description}`);
    }
    console.log("=======================");

    const { responseCallback } = options || {};
    const baseMessages = await this.runtime.buildRuntimeMessages([])

    for (const [index, step] of plan.steps.entries()) {
      const previousResults = plan.steps
        .slice(0, index)
        .map((s) => `${s.id}. ${s.description}\n结果:${s.result}`)
        .join("\n\n");

      try {
        await this.executeStep(step, {
          goal: plan.goal,
          previousResults,
          baseMessages,
          responseCallback
        })

      } catch {
        break
      }
    }

    return {
      goal: plan.goal,
      success: plan.steps.every(
        (step) => step.status === "completed",
      ),
      steps: plan.steps.map((step) => ({
        id: step.id,
        description: step.description,
        status: step.status,
        result: step.result,
      })),
    };
  }

  private async executeStep(step: PlanStep, options: {
    goal: string
    previousResults?: string
    baseMessages: ChatMessages[]
    responseCallback?: (response: ChatResponse) => void
    maxRetryCount?: number
  }) {
    const { previousResults, goal, baseMessages, responseCallback } = options

    const maxRetryCount = (options.maxRetryCount && options.maxRetryCount >= 0) ? options.maxRetryCount : this.maxRetryCount

    step.status = "running";

    const failedHistory: string[] = []
    for (let attempt = 0; attempt <= maxRetryCount; attempt++) {
      try {
        console.log(
          `[executor] step=${step.id} attempt=${attempt + 1}/${maxRetryCount + 1}`
        );
        const lastError = failedHistory.at(-1);
        const result = await this.runtime.runAgentLoop([
          ...baseMessages,
          ...toMessages([[
            "system",
            `当前任务整体目标: 
              ${goal}

              已完成步骤:
              ${previousResults || ''}
              
              当前执行步骤:
              ${step.description}
              
              ${lastError
              ? `上一次执行失败:
                  ${lastError}
                  请分析失败原因，并尝试其他方式完成任务。`
              : ''
            }
              
            规则:
            1. 只专注于执行当前步骤
            2. 不要执行后续步骤
            3. 不要总结整个计划
            4. 如果需要工具可以调用工具
            5. 当前步骤完成后立即停止
            6. 返回的内容应该尽量简洁.
              - 比如查询北京天气，
                  直接返回 北京天气为xxx 即可
                  不要返回如: 好的，我已经查询出来了，北京天气为 xxx , 气候舒服...
                `,
          ]])
        ], {
          tools: BaseToolSchemas,
          responseCallback,
        });
        step.status = "completed";
        step.result = result.response.getContent() ?? "";
        return
      } catch (error) {
        if (attempt === maxRetryCount) {
          step.status = "failed";
          step.result = String(error);
          throw error;
        } else {
          failedHistory.push(error instanceof Error
            ? error.message
            : String(error).slice(0, 200))

          if (failedHistory.length > 3) {
            failedHistory.shift()
          }
        }
      }
    }
  }
}
