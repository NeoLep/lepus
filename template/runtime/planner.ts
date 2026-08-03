import z from "zod";
import Client from "./client.ts";

const PlanSchema = z.object({
  goal: z.string().describe("要实现的目标"),
  need: z.boolean().describe("是否需要拆解任务"),
  steps: z.array(
    z.object({
      id: z.string().describe(
        "当前步骤的ID, 可以为索引方便后续查看是第几个步骤",
      ),
      description: z.string().describe("当前步骤的说明"),
      status: z.enum(["pending", "running", "completed", "failed"]).describe(
        "当前步骤的状态",
      ),
      result: z.string().nullable().describe("当前步骤的结果"),
    }),
  ),
});
export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = Plan["steps"][number];

export const TaskModeSchema = z.object({
  type: z.enum([
    "direct",
    "plan",
  ])
})
export type TaskMode = z.infer<typeof TaskModeSchema>;

export default class Planner {
  constructor(private client: Client) { }
  async shouldPlan(task: string): Promise<TaskMode['type']> {
    const res = await this.client.chat([
      {
        role: "system",
        content: `你是任务规划判断器。判断用户的任务是否需要进行步骤规划。
        例如:
       不需要规划:
        - 单一目标
        - 一到三次工具调用即可完成
        - 用户只是询问信息
      需要规划:
        - 存在多个连续目标
        - 后一步依赖前一步结果
        - 需要多个领域知识组合
        - 需要长时间执行
        - 需要中间状态保存
        - 复杂工具组合
        - 长流程任务
        - 复杂组合任务
      结果需要返回任务模式, 当前支持的任务模式 JSONSchema 如下:
      ${JSON.stringify(TaskModeSchema.toJSONSchema())}
      `,
      },
      {
        role: "user",
        content: task,
      },
    ]);

    return TaskModeSchema.parse(JSON.parse(this.client.getChatMessage(res) || '{}')).type;
  }
  async createPlan(task: string): Promise<Plan> {
    const res = await this.client.chat([
      {
        role: "system",
        content: `
      你是一个任务规划器, 根据用户输入的任务,划分执行步骤。
      你的职责:
        1. 分析用户目标
        2. 判断需要哪些执行步骤
        3. 输出结构化任务计划
      请记住:
        - 每个步骤的ID必须是唯一的, 建议使用索引作为ID, 方便后续进行查看
        - 每个步骤都要有说明
        - 只输出 JSON
          输出的 JSON Schema:
          ${JSON.stringify(PlanSchema.toJSONSchema())}
      `,
      },
      { role: "user", content: task },
    ]);

    const json = JSON.parse(this.client.getChatMessage(res)!);
    return PlanSchema.parse(json);
  }
}
