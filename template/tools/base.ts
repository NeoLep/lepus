import z from "zod";
import { createFunctionTool } from "./index.ts";
import { areaCodeMap, existFile } from "../../utils/index.ts";
import { tavily, TavilyClient } from "@tavily/core";
import { loadEnv } from "../../utils/index.ts";

const env = await loadEnv();

export const GetDate = createFunctionTool({
  name: "get_date",
  description: "获取当前日期",
  executor: () => new Date().toISOString(),
});
export const GetWeather = createFunctionTool({
  name: "get_weather",
  description:
    "(仅支持中国境内城市) 获取某个城市的天气",
  validator: z.object({ city: z.string().describe("城市名称") }),
  executor: async ({ city }) => {
    const cityCode = areaCodeMap[city];
    if (!cityCode) {
      return "城市不存在";
    }
    const res = await fetch(
      `http://t.weather.itboy.net/api/weather/city/${cityCode}`,
    );
    return await res.text();
  },
});
export const HttpRequest = createFunctionTool({
  name: "http_request",
  description: "发送HTTP请求",
  validator: z.object({
    url: z.string(),
    options: z.any().describe("与fetch相同的请求配置").optional(),
  }),
  executor: async ({ url, options }) => {
    return await fetch(url, options).then((res) => res.text()).catch((err) =>
      `请求失败: ${err}`
    );
  },
});
export const WriteFile = createFunctionTool({
  name: "write_file",
  description:
    "向当前运行目录中写入文件, 该方法会向当前运行目录中的 output 文件夹中写入文件",
  validator: z.object({
    fileName: z.string(),
    content: z.string(),
  }),
  executor: async ({ fileName, content }) => {
    try {
      await Deno.writeTextFile(`./output/${fileName}`, content);
      return "文件写入成功";
    } catch (err) {
      return `文件写入失败: ${err}`;
    }
  },
});
export const FileIsExist = createFunctionTool({
  name: "file_is_exist",
  description: "检查文件是否存在",
  validator: z.object({
    filePath: z.string().describe(
      "当前项目目录下对应的文件是否存在, 此值为路径加文件的格式",
    ),
  }),
  executor: async ({ filePath }) => {
    try {
      const exist = await existFile(filePath);
      return exist ? "文件存在" : "文件不存在";
    } catch (err) {
      return `文件不存在: ${err}`;
    }
  },
});
export const ReadDir = createFunctionTool({
  name: "read_dir",
  description: "查询指定路径下的文件",
  validator: z.object({
    path: z.string().describe("想要查询的路径地址"),
  }),
  executor: async ({ path }) => {
    try {
      const files: Deno.DirEntry[] = [];
      for await (const dirEntry of Deno.readDir(path)) {
        files.push(dirEntry);
      }
      return JSON.stringify(files);
    } catch (err) {
      return `读取目录失败: ${err}`;
    }
  },
});

export const getInputFromTerminal = createFunctionTool({
  name: "getInputFromTerminal",
  description: "让用户在控制台可以输入内容，可以用来询问用户意见与选择，获取用户信息",
  validator: z.object({
    tip: z.string().describe("要让用户输入时的提示"),
  }),
  executor: ({ tip }) => {
    return prompt(`${tip}:\n`);
  },
})

export const SearchByTavily = (() => {
  let tavilyClient: TavilyClient | null = null;
  if (!env["TAVILY_API_KEY"]) {
    console.error("TAVILY_API_KEY has not set");
    return undefined;
  } else {
    return createFunctionTool({
      name: "search_tavily",
      description: "使用 Tavily 搜索互联网内容",
      validator: z.object({
        query: z.string().describe("要查询的内容"),
      }),
      executor: async ({ query }) => {
        try {
          if (!tavilyClient) {
            tavilyClient = tavily({ apiKey: env["TAVILY_API_KEY"] });
          }
          const res = await tavilyClient.search(query, {
            searchDepth: "advanced",
          });
          return res;
        } catch (err) {
          return `搜索失败: ${err}`;
        }
      },
    });
  }
})();