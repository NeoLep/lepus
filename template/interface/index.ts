import { isAsyncFunction } from "../../utils/index.ts";
import { Env } from "../../utils/loadEnv.ts";
import { AgentRuntime, toMessages } from "../runtime/agent.ts";
import Client from "../runtime/client.ts";
import { preprocessInput } from "./commands.ts";

async function _once(agent: AgentRuntime, chat: string) {
  const res = await agent.chat(
    toMessages([
      ["system", "你是一个专业的法律助手"],
      ["user", chat],
    ]),
    (r) => {
      console.log(r.getContent());
    },
  );
  console.log(res?.getContent());
}

export async function generate(env: Env) {
  const agent = new AgentRuntime({
    client: new Client({
      apiKey: env["DEEPSEEK_API_KEY"],
      baseURL: "https://api.deepseek.com",
    }),
  });
  // await client.memory.insertDoc("./docs/火龙果-hPhone17产品介绍.md");
  console.log("输入 /help 查看控制台帮助，输入 /skills 查看可用 skills。");

  let shutdown = false;
  while (!shutdown) {
    const input = prompt(`你:`);
    if (!input || input.trim() === "") continue;
    
    const nextWhile = await preprocessInput({ input, agent })
    if (nextWhile === 'continue') continue
    if (nextWhile === 'shutdown') break

    

    await agent.chat(
      toMessages([["user", input]]),
      (res) => res.getContent() && console.log(res.getContent()),
    );
  }
}
