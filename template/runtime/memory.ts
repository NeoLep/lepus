import OpenAI from "openai";
import { ChatMessages, toMessages } from "./agent.ts";
import Client from "./client.ts";

interface MemoryFileType {
  history: ChatMessages[];
  facts: string[];
  summary: string;
}

export default class Memory {
  static HISTORY_LIMIT = 10;
  static SUMMARY_TOKEN_COUNT = 200;
  static DOC_CONFIDENCE = {
    FILE_NAME: 0.5,
    PARAGRAPH: 0.6,
  };
  private summarizing = false;
  private storedHistory: ChatCompletionMessageParam[] = [];

  memory: MemoryFileType = {
    history: [] as ChatCompletionMessageParam[], // 对话历史
    facts: [] as string[], // 用户事实
    summary: "", // 对话摘要
  };

  at = (index: number) => this.memory.history.at(index);
  chat: Client["chat"];

  constructor(chat: Client["chat"]) {
    this.chat = chat;
  }
  async buildMemory(): Promise<
    OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  > {
    return await [
      ...toMessages([
        [
          "system",
          `目前已知的用户事实:\n${this.memory.facts.join("\n") || "暂无"}`,
        ],
        [
          "user",
          `目前已知的对话摘要:\n${this.memory.summary || "暂无"}`,
        ],
      ]),
      ...this.memory.history,
    ];
  }
  private async summarize(snapshot: ChatCompletionMessageParam[]) {
    // update facts
    const res = await this.chat([
      {
        role: "system",
        content: `\n你是记忆提取器。\n当前事实：\n${this.memory.facts.join("\n") || "暂无"
          }\n从下面对话中提取用户长期稳定的信息：\n例如：\n- 用户职业\n- 用户兴趣\n- 用户偏好\n- 用户技能\n- 用户常用技术栈\n不要记录临时事件。\n输出 JSON 数组。\n注意当存在某些信息变更的时候，要记得说明什么变成了什么，如用户曾叫A现在变成了B。\n例如：\n[\n  "用户是前端工程师",\n  "用户喜欢 Rust"\n]`,
      },
      ...snapshot,
    ]);
    const facts = JSON.parse(res.choices[0].message.content || "[]");
    const set = new Set([...this.memory.facts, ...facts]);
    this.memory.facts = [...set];
    // update summary
    const sumRes = await this.chat([
      {
        role: "system",
        content:
          `你是对话摘要器。\n请将下面对话压缩成 ${Memory.SUMMARY_TOKEN_COUNT} 字以内摘要。\n重点保留：\n- 当前项目\n- 已完成内容\n- 未完成内容\n- 用户决策\n- 重要约束\n输出纯文本。\n之前的摘要:\n${this.memory.summary}`,
      },
      ...snapshot,
    ]);
    this.memory.summary = sumRes.choices[0].message.content || "";
  }
  async push(...historys: ChatCompletionMessageParam[]) {
    this.storedHistory.push(...historys);
    this.memory.history.push(...historys);

    if (this.summarizing) return;
    if (this.memory.history.length < Memory.HISTORY_LIMIT) return;

    this.summarizing = true;
    // ⭐ 关键：快照
    const snapshot = [...this.memory.history];
    try {
      await this.summarize(snapshot);
      this.memory.history.splice(0, snapshot.length); // ⭐ 只删除 snapshot 对应部分（或者直接不删）
    } catch (err) {
      console.error("=[!]= 总结失败, 将在下次对话后重试 ===");
      console.error(err);
      console.log("======================================");
    } finally {
      this.summarizing = false;
    }
  }
  async save(path = "cache") {
    await Deno.writeTextFile(
      `${path}/memory.json`,
      JSON.stringify(this.memory, null, 2),
    );
    return `${path}/memory.json`;
  }
  async load(path = "cache") {
    const memorySource = await Deno.readTextFile(`${path}/memory.json`);
    this.memory = JSON.parse(memorySource) as typeof this.memory;
  }
}
