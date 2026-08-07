#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

const options = {
  target: 'auto',
  install: true,
  lint: true,
  dryRun: false
}

function printHelp() {
  console.log(`Lepus 一键构建脚本

用法：
  pnpm release:auto [选项]

选项：
  --target <目标>     auto、mac-arm64、mac-x64、win-x64、linux-x64
  --skip-install      跳过 pnpm install
  --skip-lint         跳过 ESLint 检查
  --dry-run           只显示将执行的命令
  -h, --help          显示帮助

示例：
  pnpm release:auto
  pnpm release:auto -- --skip-install
  pnpm release:auto -- --target mac-x64
`)
}

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]

  if (arg === '--') continue

  if (arg === '-h' || arg === '--help') {
    printHelp()
    process.exit(0)
  }

  if (arg === '--skip-install') {
    options.install = false
    continue
  }

  if (arg === '--skip-lint') {
    options.lint = false
    continue
  }

  if (arg === '--dry-run') {
    options.dryRun = true
    continue
  }

  if (arg === '--target') {
    options.target = args[index + 1]
    index += 1
    if (!options.target) {
      console.error('错误：--target 后需要提供构建目标。')
      process.exit(1)
    }
    continue
  }

  if (arg.startsWith('--target=')) {
    options.target = arg.slice('--target='.length)
    continue
  }

  console.error(`错误：未知参数 ${arg}`)
  printHelp()
  process.exit(1)
}

const detectedTarget = (() => {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
  }

  if (process.platform === 'win32') return 'win-x64'
  if (process.platform === 'linux') return 'linux-x64'

  return null
})()

const target = options.target === 'auto' ? detectedTarget : options.target
const releaseScripts = {
  'mac-arm64': 'release:mac:arm64',
  'mac-x64': 'release:mac:x64',
  'win-x64': 'release:win',
  'linux-x64': 'release:linux'
}

if (!target || !releaseScripts[target]) {
  console.error(`错误：不支持构建目标 ${target ?? `${process.platform}-${process.arch}`}。`)
  printHelp()
  process.exit(1)
}

const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(command, commandArgs) {
  const printableCommand = [command, ...commandArgs].join(' ')
  console.log(`\n> ${printableCommand}`)

  if (options.dryRun) return

  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit'
  })

  if (result.error) {
    console.error(`\n无法执行 ${command}：${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`\n构建已停止，命令退出码：${result.status ?? '未知'}`)
    process.exit(result.status ?? 1)
  }
}

function findInstallers(directory) {
  if (!existsSync(directory)) return []

  const installerExtensions = new Set(['.AppImage', '.deb', '.dmg', '.exe', '.zip'])
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...findInstallers(entryPath))
    } else if (installerExtensions.has(extname(entry.name))) {
      files.push(entryPath)
    }
  }

  return files.sort()
}

console.log(`\nLepus v${packageJson.version} 自动构建`)
console.log(`目标：${target}${options.target === 'auto' ? '（自动识别）' : ''}`)
console.log(`输出：${resolve(projectRoot, 'dist')}`)

run(pnpmCommand, ['--version'])

if (options.install) {
  run(pnpmCommand, ['install', '--frozen-lockfile'])
}

if (options.lint) {
  run(pnpmCommand, ['exec', 'eslint', 'src', '--cache'])
}

run(pnpmCommand, [releaseScripts[target]])

if (options.dryRun) {
  console.log('\nDry run 完成，未执行实际构建。')
  process.exit(0)
}

const installers = findInstallers(resolve(projectRoot, 'dist'))

console.log('\n构建完成。')
if (installers.length === 0) {
  console.log('未在 dist 目录发现安装包，请查看上方 electron-builder 输出。')
} else {
  console.log('生成的安装包：')
  for (const installer of installers) {
    const sizeInMb = (statSync(installer).size / 1024 / 1024).toFixed(1)
    console.log(`- ${installer} (${sizeInMb} MB)`)
  }
}
