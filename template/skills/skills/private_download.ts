import { Skill } from "../types.ts";

export const PrivateDownloaderSkill: Skill = {
  id: "private_download",
  name: "私人下载助手",
  description: "从 MTeam 查询资源，生成 torrent 地址并添加到你的 qBittorrent",
  scope: "private",
  instructions: `
你是一名私人下载助手。
处理问题时遵循以下流程：
1. 先从 MTeam 查询资源，整理候选项
2. 如果用户没有提供明确资源 id，或者候选项存在歧义，先让用户确认目标
3. 只有在目标明确时，才获取 torrent 地址并添加到 qBittorrent
4. 不要擅自选择第一个结果直接下载
5. 如果用户是查询下载状态，可以直接读取 qBittorrent 任务列表
`,
  toolNames: [
    "query_from_mteam",
    "get_torrent_url_from_mteam",
    "add_torrent_to_qbit",
    "get_qb_all_download",
  ],
  async run(context) {
    const input = context.input.trim();

    if (!input) {
      return {
        handled: true,
        response:
          "请告诉我要执行的下载动作，例如：`/skill private_download 搜索 星际穿越`，或者 `/skill private_download 查看下载状态`。",
      };
    }

    if (/(查看|查询|列出).*(下载|任务)|下载状态/.test(input)) {
      context.log("命中私人下载 workflow: 查询 qBittorrent 任务");
      const result = await context.callTool("get_qb_all_download");
      return {
        handled: true,
        response: `当前 qBittorrent 任务列表：\n${JSON.stringify(result, null, 2)}`,
      };
    }

    const downloadMatch = input.match(
      /(?:下载|添加|加入).*(?:id[:=]?\s*|资源\s*id[:=]?\s*)(\d+)/i,
    );
    if (downloadMatch) {
      const id = downloadMatch[1];
      context.log(`命中私人下载 workflow: 通过 id=${id} 添加下载`);
      const torrentResult = await context.callTool("get_torrent_url_from_mteam", {
        id,
      });
      const torrentUrl = typeof torrentResult === "string"
        ? torrentResult
        : (torrentResult as { data?: string })?.data ??
          JSON.stringify(torrentResult);
      const addResult = await context.callTool("add_torrent_to_qbit", {
        path: torrentUrl,
      });
      return {
        handled: true,
        response:
          `已尝试将资源 ${id} 添加到 qBittorrent。\n种子地址结果：${
            JSON.stringify(torrentResult, null, 2)
          }\n添加结果：${JSON.stringify(addResult, null, 2)}`,
      };
    }

    const searchMatch = input.match(/^(?:搜索|查找|查询)\s+(.+)$/);
    if (searchMatch) {
      const movieName = searchMatch[1].trim();
      context.log(`命中私人下载 workflow: 搜索资源 ${movieName}`);
      const result = await context.callTool("query_from_mteam", { movieName });
      return {
        handled: true,
        response:
          `MTeam 搜索结果（请从结果里确认资源 id，再执行下载）：\n${
            JSON.stringify(result, null, 2)
          }`,
      };
    }

    return null;
  },
};
