# Lepus

Lepus 是一个本地优先的桌面 AI 工作台：连接兼容 OpenAI API 的模型，让 AI 在可控权限下理解文件、搜索信息、规划任务并操作工作目录。

[产品主页](https://neolep.github.io/lepus/) · [产品功能说明](./PRODUCT.md)

## 核心能力

- 自定义模型服务：配置 API 地址、模型、密钥与上下文窗口。
- Agent 工具执行：检索、读取和修改文件，读取经用户确认的剪切板文本，下载公开资源，并展示执行过程。
- 任务模式：自动识别复杂请求，生成计划，并把独立分析交给受控子 Agent。
- 可恢复交互：执行途中缺少选择、账号或密码时暂停并显示输入卡片，回答后继续原任务；敏感内容隐藏显示且不保存明文。
- Skills：创建或导入专业技能，通过 `/` 命令按需启用。
- 多源网页搜索：支持 Brave、Tavily、Exa、Perplexity、Firecrawl 与 SearXNG，并保留来源引用。
- 文件理解：支持图片、PDF 与文本附件；PDF 可在本地提取文本。
- 安全控制：限定工作目录，提供逐次确认、自动批准和完全访问三种权限模式，并可按来源信任浏览器页面操作。
- 本地会话管理：会话、消息和设置保存到本地，支持搜索、置顶、归档及 Markdown/JSON 导出。
- 远程机器人：通过飞书自建应用的 WebSocket 长连接，在手机飞书中与本机运行的 Lepus 对话，无需公网回调地址。

## 飞书远程接入

在侧边栏打开“远程接入”，填写飞书自建应用的 App ID 和 App Secret，然后启用远程机器人。飞书开发者后台需要：

1. 为企业自建应用添加机器人能力；
2. 开通接收消息、以应用身份发送消息和“获取用户基本信息”权限；
3. 在事件订阅中选择“使用长连接”，订阅 `im.message.receive_v1`；
4. 创建并发布版本，将应用可见范围限制为自己或可信用户。

远程消息会保存为普通 Lepus 会话，并使用当前选中的模型。你可以为飞书会话分别启用基础工具、联网搜索、本地文件只读访问、自动匹配的 Skills、公开网页浏览器操作和剪贴板读取，并限制单条消息的工具轮数。本地文件能力只访问显式选择的工作文件夹；写文件、运行脚本、浏览器安装和内网访问始终禁用。还可以配置飞书用户 Open ID 白名单；白名单为空时，应用可见范围内的用户都可以发起对话。

## 开发

要求 Node.js 与 pnpm。

```bash
pnpm install
pnpm dev
```

质量检查与构建：

```bash
pnpm typecheck
pnpm lint
pnpm build
```

桌面安装包：

```bash
pnpm build:win
pnpm build:mac
pnpm build:linux
```

## 发布 Release

GitHub Actions 会在推送 `v*` 标签后自动构建以下安装包：

- macOS Apple Silicon（arm64）：DMG、ZIP
- macOS Intel（x64）：DMG、ZIP
- Windows x64：NSIS 安装程序
- Linux x64：AppImage、DEB

发布前先更新 `package.json` 中的版本并提交，然后创建完全一致的标签：

```bash
# 例如 package.json 的版本为 1.0.1
git tag v1.0.1
git push origin v1.0.1
```

工作流完成后会自动发布一个包含安装包和 `SHA256SUMS.txt` 的 GitHub Release。版本标签与 `package.json` 不一致时，工作流会拒绝构建。

当前安装包未配置 Apple/Windows 代码签名，首次打开时可能出现系统安全提示。正式分发前应配置签名与 macOS 公证。

### 本地一键构建

在项目根目录执行：

```bash
pnpm release:auto
```

脚本会自动识别当前系统和 CPU 架构，依次安装依赖、检查 `src` 代码并生成对应平台安装包，结果位于 `dist/`。常用选项：

```bash
# 已安装依赖时加快构建
pnpm release:auto -- --skip-install

# 手动指定目标
pnpm release:auto -- --target mac-arm64

# 查看全部选项
pnpm release:auto -- --help
```

支持目标：`mac-arm64`、`mac-x64`、`win-x64`、`linux-x64`。跨平台打包可能受原生依赖和系统工具限制；构建全部平台仍建议使用 GitHub Actions。

### 一键触发全平台发布

需要发布新版本时运行：

```bash
pnpm release:publish
```

脚本会同步远端标签、显示 `package.json` 和 Git 标签中的最新版本、建议下一个补丁版本，并提示输入新版本号。确认后，它会执行 ESLint 和类型检查、更新版本号、提交当前修改、创建版本标签，然后将 `main` 与标签原子推送到 GitHub，以触发全平台 GitHub Actions。

如果工作区存在未提交修改，脚本会先列出并要求确认，避免意外提交。发布前请确保当前位于 `main` 分支。

```bash
# 预览流程，不修改或推送
pnpm release:publish -- --dry-run

# 跳过本地检查（GitHub Actions 仍会执行检查）
pnpm release:publish -- --skip-checks
```

## 技术栈

Electron · Vue 3 · TypeScript · SQLite · electron-vite

## 浏览器操作

Lepus Agent 支持通过 Playwright 操作独立的浏览器会话，包括：

- 打开公开 HTTPS 网页并读取面向 AI 的 ARIA 页面快照
- 使用快照元素引用执行点击、输入、下拉选择和滚动
- 管理前进、后退、标签页和网页截图
- 使用 Lepus 专用持久化 Profile 保存登录状态，与日常浏览器数据隔离

首次使用时，Lepus 会优先使用设备上已安装的 Chrome、Edge、Brave 或 Chromium，并使用 Lepus 自己的独立用户配置，不会读写日常浏览器资料。只有在没有兼容浏览器时，Agent 才会请求下载 Chromium 组件；该组件存储在 Lepus 用户数据目录，不包含在应用安装包中。公网导航会阻止 localhost、局域网、保留地址和包含凭据的 URL；用户明确要求访问局域网 HTTP/HTTPS 页面时，Lepus 会单独请求高风险确认，并只放行获得授权的内网主机。输入、点击、安装和截图等操作也会根据风险请求用户确认。

在浏览器操作卡片中可以直接信任当前页面地址，也可以在“文件与权限 → 浏览器信任地址”中维护。信任项按协议、主机和端口匹配；可信页面中的点击、输入和下拉选择不再逐次审批。浏览器安装、截图写文件及其他高风险能力不受该设置影响。
