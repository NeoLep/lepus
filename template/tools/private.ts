import z from "zod";
import { createFunctionTool } from "./index.ts";
import { loadEnv } from "../../utils/index.ts";

const env = await loadEnv();

export const QueryFromMteam = createFunctionTool({
  name: "query_from_mteam",
  description: "从 m-team(馒头) 查询影片",
  validator: z.object({
    movieName: z.string().describe("要查询的影片名"),
  }),
  async executor({ movieName }) {
    return await fetch("https://api.m-team.cc/api/torrent/search", {
      method: "POST",
      body: JSON.stringify({
        keyword: movieName,
        mode: "normal",
        pageNumber: 1,
        pageSize: 20,
      }),
      headers: {
        accept: "*/*",
        "Content-Type": "application/json",
        "x-api-key": env["MTEAM_X_API_KEY"],
      },
    }).then((res) => res.text()).catch((err) => `请求失败: ${err}`);
  },
});

export const GetTorrentUrlFromMteam = createFunctionTool({
  name: "get_torrent_url_from_mteam",
  description: "从MTeam获取种子文件地址",
  validator: z.object({
    id: z.string().describe("对应的资源的id"),
  }),
  executor: async ({ id }) => {
    return await fetch(
      `https://api.m-team.cc/api/torrent/genDlToken?id=${id}`,
      {
        method: "POST",
        headers: {
          "x-api-key": env["MTEAM_X_API_KEY"],
        },
      },
    ).then((res) => res.json()).catch((err) => `请求失败: ${err}`);
  },
});

export const AddTorrentToQbit = createFunctionTool({
  name: "add_torrent_to_qbit",
  description: "向我本地的qbittorrent客户端添加下载任务",
  validator: z.object({
    path: z.string().describe("torrent链接"),
  }),
  executor: async ({ path }) => {
    const form = new FormData();
    form.append("urls", path);
    form.append("savepath", "/volume1/Download/qbittorrent/movies");
    form.append('downloadPath', "/volume1/Download/qbittorrent/temp")
    return await fetch(`${env["QBIT_BASE"]}/api/v2/torrents/add`, {
      method: "POST",
      body: form,
    }).then((res) => res.text()).catch((err) => `请求失败: ${err}`);
  },
});

export const getAllDownload = createFunctionTool({
  name: "get_qb_all_download",
  description: "向我本地的qbittorrent客户端获取所有任务",
  executor: async () => {
    return await fetch(`${env["QBIT_BASE"]}/api/v2/torrents/info`, {
      method: "GET",
    }).then((res) => res.text()).catch((err) => `请求失败: ${err}`);
  },
});
