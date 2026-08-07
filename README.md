# Lepus

Lepus 是一个本地优先的桌面 AI 工作台：连接兼容 OpenAI API 的模型，让 AI 在可控权限下理解文件、搜索信息、规划任务并操作工作目录。

[产品主页](https://neolep.github.io/lepus/) · [产品功能说明](./PRODUCT.md)

## 核心能力

- 自定义模型服务：配置 API 地址、模型、密钥与上下文窗口。
- Agent 工具执行：检索、读取和修改文件，下载公开资源，并展示执行过程。
- 任务模式：自动识别复杂请求，生成计划，并把独立分析交给受控子 Agent。
- Skills：创建或导入专业技能，通过 `/` 命令按需启用。
- 多源网页搜索：支持 Brave、Tavily、Exa、Perplexity、Firecrawl 与 SearXNG，并保留来源引用。
- 文件理解：支持图片、PDF 与文本附件；PDF 可在本地提取文本。
- 安全控制：限定工作目录，并提供逐次确认、自动批准和完全访问三种权限模式。
- 本地会话管理：会话、消息和设置保存到本地，支持搜索、置顶、归档及 Markdown/JSON 导出。

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
