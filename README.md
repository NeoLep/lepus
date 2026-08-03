# lepus

An Electron application with Vue and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Web search

The `search_web` function tool supports Brave Search, Tavily, Exa, Perplexity, Firecrawl, and
SearXNG. Open **Web search** in the sidebar, enable any number of providers, and enter the
corresponding API Keys. SearXNG uses the URL of a self-hosted instance with JSON output enabled.
Only enabled providers are exposed to the AI.

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```
