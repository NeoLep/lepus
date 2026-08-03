import { Skill } from "../types.ts";

interface TavilySearchResultItem {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  answer?: string;
  query?: string;
  results?: TavilySearchResultItem[];
}

function parseResearchRequest(input: string) {
  const outputMatch = input.match(
    /(?:保存到|写入|输出到)\s+([^\s]+\.(?:md|markdown))/i,
  );
  const outputFileName = outputMatch?.[1];
  const topic = input
    .replace(/(?:保存到|写入|输出到)\s+[^\s]+\.(?:md|markdown)/ig, "")
    .replace(/^(?:请)?(?:帮我)?(?:做一下)?(?:调研|研究|查资料|搜索)\s*/i, "")
    .trim();

  return {
    topic: topic || input.trim(),
    outputFileName,
  };
}

function normalizeSnippet(text?: string, limit = 180) {
  if (!text) {
    return "无摘要";
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
}

function formatResearchReport(
  topic: string,
  rawResult: unknown,
) {
  if (typeof rawResult === "string") {
    return [
      "# 调研报告",
      "",
      `主题: ${topic}`,
      "",
      "## 背景与目标",
      "",
      `本次调研围绕“${topic}”展开，目标是先快速收集公开资料并形成初步摘要。`,
      "",
      "## 检索结果",
      "",
      rawResult,
      "",
      "## 风险与不确定性",
      "",
      "- 当前结果为原始字符串输出，尚未完成结构化整理。",
      "- 如果需要正式结论，建议继续补充来源核验与多维对比。",
    ].join("\n");
  }

  const searchResult = rawResult as TavilySearchResponse;
  const results = Array.isArray(searchResult.results) ? searchResult.results : [];
  const lines: string[] = [
    "# 调研报告",
    "",
    `主题: ${topic}`,
  ];

  lines.push(
    "",
    "## 背景与目标",
    "",
    `本次调研围绕“${topic}”展开，目标是快速收集公开信息，整理关键事实、初步结论和后续待确认项。`,
  );

  if (searchResult.query) {
    lines.push("", "## 检索信息", "", `检索词: ${searchResult.query}`);
  }

  lines.push("", "## 核心结论", "");
  if (searchResult.answer) {
    lines.push(searchResult.answer);
  } else if (results.length > 0) {
    lines.push(
      `当前未返回独立总结答案，初步可参考前 ${Math.min(results.length, 3)} 条结果形成判断。`,
    );
  } else {
    lines.push("当前没有足够结果形成可靠结论。");
  }

  lines.push("", "## 关键发现");

  if (results.length > 0) {
    results.slice(0, 5).forEach((item, index) => {
      lines.push(
        "",
        `### ${index + 1}. ${item.title || "未命名结果"}`,
        item.url ? `来源: ${item.url}` : "来源: 未提供",
        item.score !== undefined ? `相关性: ${item.score}` : "相关性: 未提供",
        "",
        normalizeSnippet(item.content),
      );
    });
  } else {
    lines.push("", "未返回可用的搜索结果。");
  }

  lines.push("", "## 观察与分析", "");
  if (results.length > 0) {
    lines.push(
      ...results.slice(0, 3).map((item, index) =>
        `- 观察 ${index + 1}: ${item.title || "未命名结果"}。${
          normalizeSnippet(item.content, 120)
        }`
      ),
    );
  } else {
    lines.push("- 当前没有足够材料支撑分析。");
  }

  lines.push(
    "",
    "## 风险与不确定性",
    "",
    "- 当前结论主要基于搜索结果摘要，而不是逐篇完整阅读后的严格研究。",
    `- 本次共纳入 ${results.length} 条候选结果，结果数量${
      results.length < 3 ? "偏少，结论可靠性有限" : "尚可，但仍建议补充交叉验证"
    }。`,
    "- 如果该主题用于正式决策，建议继续核对原始来源、发布时间和适用范围。",
  );

  lines.push(
    "",
    "## 建议后续动作",
    "",
    "- 挑选 2 到 3 个高相关来源做精读。",
    "- 如涉及对比结论，补一张按维度拆解的对照表。",
    "- 如需要正式交付，可在此基础上继续扩写为完整报告或简报。",
  );

  return lines.join("\n");
}

function isResearchIntent(input: string) {
  const text = input.trim();
  if (!text) {
    return false;
  }
  if (/(保存到|写入|输出到)\s+[^\s]+\.(md|markdown)/i.test(text)) {
    return true;
  }
  if (/(对比|比较|综述|报告|调研|研究|资料|盘点)/.test(text)) {
    return true;
  }
  if (/(帮我|请).*(查|搜|调研|研究)/.test(text)) {
    return true;
  }
  if (/(.+)\s+(vs|VS|对比)\s+(.+)/.test(text)) {
    return true;
  }
  return false;
}

export const ResearchSkill: Skill = {
  id: "research",
  name: "调研助手",
  description: "搜索资料、整理要点、输出研究摘要或报告",
  scope: "public",
  instructions: `
你是一名调研助手。
处理问题时遵循以下流程：
1. 先明确调研目标、范围和输出形式
2. 优先搜索和收集资料，再整理结论，不要直接凭印象回答
3. 输出时区分事实、结论和不确定项
4. 如果用户要求产出文档，先组织结构，再写入文件
5. 涉及对比、总结、综述时，尽量按维度整理，而不是堆砌信息
  `,
  toolNames: ["search_tavily", "write_file", "file_is_exist", "read_dir"],
  triggers: ["调研", "研究", "资料", "报告", "综述", "对比"],
  match: ({ input }) => isResearchIntent(input),
  async run(context) {
    const input = context.input.trim();
    if (!input) {
      return {
        handled: true,
        response:
          "请告诉我要调研的主题，例如：`/skill research 调研一下最近的掌机市场`，或者 `/skill research 调研一下 AI IDE，并保存到 ai-ide.md`。",
      };
    }

    const { topic, outputFileName } = parseResearchRequest(input);
    if (!topic) {
      return {
        handled: true,
        response: "请补充具体调研主题，我才能开始搜索和整理资料。",
      };
    }

    context.log(`命中调研 workflow: 搜索主题 ${topic}`);
    const searchResult = await context.callTool("search_tavily", {
      query: topic,
    });

    if (
      typeof searchResult === "string" &&
      (searchResult.includes("未找到工具") || searchResult.includes("搜索失败"))
    ) {
      return {
        handled: true,
        response:
          `调研 workflow 无法完成搜索。\n原因: ${searchResult}\n请确认 Tavily 工具已启用，并且相关环境变量已经配置。`,
      };
    }

    const report = formatResearchReport(topic, searchResult);
    if (!outputFileName) {
      return {
        handled: true,
        response: report,
      };
    }

    context.log(`命中调研 workflow: 写入文件 ${outputFileName}`);
    const writeResult = await context.callTool("write_file", {
      fileName: outputFileName,
      content: report,
    });
    return {
      handled: true,
      response:
        `已完成调研，并尝试写入 output/${outputFileName}。\n写入结果: ${
          JSON.stringify(writeResult, null, 2)
        }\n\n${report}`,
    };
  },
};
