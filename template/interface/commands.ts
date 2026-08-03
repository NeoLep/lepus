import { isAsyncFunction } from "../../utils/index.ts";
import { AgentRuntime } from "../runtime/agent.ts";

export type CommandSignal = "shutdown" | "continue" | undefined
interface CommandItem {
  cmd: string;
  description: string;
  action: (tools: {
    agent: AgentRuntime;
  }, args: any) => CommandSignal | Promise<CommandSignal>;
}

export function parseCommand(input: string) {
  const match = input.match(
    /^([\w.]+)\((.*)\)$/,
  );
  if (!match) return null;
  return {
    name: match[1],
    args: match[2],
  };
}
function printConsoleHelp() {
  console.log("控制台命令:");
  console.log("- /help 查看帮助");
  for (const command of Commands) {
    console.log(`- ${command.cmd}()  ${command.description}`);
  }
}
function stripQuotes(input: string) {
  const trimmed = input.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export const Commands: CommandItem[] = [
  {
    cmd: "exit",
    description: "退出当前控制台会话",
    action: () => 'shutdown',
  },
  {
    cmd: "memory.save",
    description: "保存当前 memory 到 cache/memory.json",
    action: async ({ agent }) => {
      console.log(`Save to: ${await agent.memory.save()}`)
    }
  },
  {
    cmd: "memory.load",
    description: "从 cache/memory.json 加载 memory",
    action: async ({ agent }) => {
      await agent.memory.load();
      console.log(`loaded...`);
    },
  },
  {
    cmd: "memory.memory",
    description: "查看完整 memory",
    action: ({ agent }) => {
      console.log(agent.memory.memory)
    },
  },
  {
    cmd: "memory.history",
    description: "查看历史消息",
    action: ({ agent }) => {
      console.log(agent.memory.memory.history)
    },
  },
  {
    cmd: "memory.facts",
    description: "查看抽取出的用户 facts",
    action: ({ agent }) => {
      console.log(agent.memory.memory.facts)
    },
  },
  {
    cmd: "kn.load",
    description: "加载指定知识库文件，例如 kn.load('./docs/a.md')",
    action: async ({ agent }, filePath: string) => {
      filePath = stripQuotes(filePath);
      await agent.knowledge.load(filePath);
    },
  },
];
export const CommandsDict = new Map(Commands.map((item) => [item.cmd, item]));



export async function preprocessInput(args: { input: string, agent: AgentRuntime }): Promise<CommandSignal> {
  let input = args.input
  const { agent } = args
  
  input = input.trim()
  if (input === "/help") {
    printConsoleHelp();
    return 'continue'
  } else {
    const command = parseCommand(input);
    if (command && CommandsDict.get(command.name)) {
      const cmdItem = CommandsDict.get(command.name)!;
      const systemArgs = {
        agent,
        client: agent.client,
        memory: agent.memory,
        knowledge: agent.knowledge,
      } as const;

      let cmdAction: CommandSignal = 'continue'
      if (isAsyncFunction(cmdItem.action)) {
        cmdAction = await cmdItem.action(
          systemArgs,
          command.args,
        );
      } else {
        cmdAction = cmdItem.action(
          systemArgs,
          command.args,
        ) as CommandSignal;
      }
      if (!cmdAction) cmdAction = 'continue'
      return cmdAction
    }
  }
}