#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJsonPath = resolve(projectRoot, 'package.json')
const args = process.argv.slice(2).filter((arg) => arg !== '--')
const dryRun = args.includes('--dry-run')
const skipChecks = args.includes('--skip-checks')
const versionArgumentIndex = args.indexOf('--version')
const requestedVersion = versionArgumentIndex >= 0 ? args[versionArgumentIndex + 1] : null

function printHelp() {
  console.log(`Lepus GitHub Release 发布脚本

用法：
  pnpm release:publish

选项：
  --version <版本>   直接指定版本号，仍会要求最终确认
  --skip-checks      跳过 ESLint 和类型检查
  --dry-run          只预览发布计划，不修改或推送
  -h, --help         显示帮助
`)
}

if (args.includes('-h') || args.includes('--help')) {
  printHelp()
  process.exit(0)
}

const knownArguments = new Set(['--dry-run', '--skip-checks', '--version'])
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (arg === '--version') {
    index += 1
    if (!args[index]) {
      console.error('错误：--version 后需要提供版本号。')
      process.exit(1)
    }
  } else if (!knownArguments.has(arg)) {
    console.error(`错误：未知参数 ${arg}`)
    printHelp()
    process.exit(1)
  }
}

function run(command, commandArgs, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    encoding: capture ? 'utf8' : undefined,
    env: process.env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  })

  if (result.error) {
    console.error(`无法执行 ${command}：${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0 && !allowFailure) {
    if (capture && result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  return {
    status: result.status,
    stdout: capture ? result.stdout.trim() : '',
    stderr: capture ? result.stderr.trim() : ''
  }
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  return match ? match.slice(1).map(Number) : null
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  if (!leftParts || !rightParts) return 0

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index]
  }
  return 0
}

function nextPatchVersion(version) {
  const [major, minor, patch] = parseVersion(version)
  return `${major}.${minor}.${patch + 1}`
}

function getPackageVersion() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version
}

function getLatestTagVersion() {
  const tags = run('git', ['tag', '--list', 'v[0-9]*', '--sort=-v:refname'], {
    capture: true
  }).stdout

  for (const tag of tags.split('\n')) {
    const version = tag.startsWith('v') ? tag.slice(1) : tag
    if (parseVersion(version)) return version
  }
  return null
}

function updatePackageVersion(version) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  packageJson.version = version
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

const currentBranch = run('git', ['branch', '--show-current'], { capture: true }).stdout
if (currentBranch !== 'main') {
  console.error(`错误：当前分支是 ${currentBranch || 'detached HEAD'}，请切换到 main 后发布。`)
  process.exit(1)
}

const originUrl = run('git', ['remote', 'get-url', 'origin'], {
  capture: true,
  allowFailure: true
})
if (originUrl.status !== 0) {
  console.error('错误：仓库没有配置 origin 远端。')
  process.exit(1)
}

if (!dryRun) {
  console.log('正在同步远端分支和版本标签…')
  run('git', ['fetch', 'origin', 'main', '--tags'])

  const divergence = run('git', ['rev-list', '--left-right', '--count', 'origin/main...HEAD'], {
    capture: true
  }).stdout
  const [behind, ahead] = divergence.split(/\s+/).map(Number)

  if (behind > 0) {
    console.error(`错误：本地 main 落后 origin/main ${behind} 个提交，请先拉取并处理合并。`)
    process.exit(1)
  }

  if (ahead > 0) console.log(`提示：本地 main 有 ${ahead} 个尚未推送的提交，将一起发布。`)
}

const packageVersion = getPackageVersion()
const latestTagVersion = getLatestTagVersion()
const latestVersion =
  latestTagVersion && compareVersions(latestTagVersion, packageVersion) > 0
    ? latestTagVersion
    : packageVersion
const suggestedVersion = nextPatchVersion(latestVersion)

console.log('\n当前版本信息：')
console.log(`- package.json：${packageVersion}`)
console.log(`- 最新 Git 标签：${latestTagVersion ? `v${latestTagVersion}` : '无'}`)
console.log(`- 建议新版本：${suggestedVersion}`)

const readline = createInterface({ input, output })
let newVersion = requestedVersion

if (!newVersion) {
  const answer = await readline.question(`\n请输入新版本号（直接回车使用 ${suggestedVersion}）：`)
  newVersion = answer.trim() || suggestedVersion
}

if (!parseVersion(newVersion)) {
  console.error('错误：版本号必须使用 x.y.z 格式，例如 1.2.0。')
  readline.close()
  process.exit(1)
}

if (compareVersions(newVersion, latestVersion) <= 0) {
  console.error(`错误：新版本 ${newVersion} 必须高于当前最新版本 ${latestVersion}。`)
  readline.close()
  process.exit(1)
}

const tagName = `v${newVersion}`
const existingTag = run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tagName}`], {
  capture: true,
  allowFailure: true
})
if (existingTag.status === 0) {
  console.error(`错误：标签 ${tagName} 已存在。`)
  readline.close()
  process.exit(1)
}

const worktreeStatus = run('git', ['status', '--short'], { capture: true }).stdout
if (worktreeStatus) {
  console.log('\n检测到以下未提交修改：')
  console.log(worktreeStatus)

  if (!dryRun) {
    const includeChanges = await readline.question(
      '\n这些修改将随新版本一起提交。确认包含它们吗？[y/N] '
    )
    if (!/^y(es)?$/i.test(includeChanges.trim())) {
      console.log('已取消发布，未修改任何文件。')
      readline.close()
      process.exit(0)
    }
  }
}

console.log(`\n发布计划：${tagName} → origin/main → GitHub Actions 全平台构建`)

if (dryRun) {
  console.log('Dry run 完成，未修改文件、创建提交或推送标签。')
  readline.close()
  process.exit(0)
}

const confirmation = await readline.question(`输入 yes 确认发布 ${tagName}：`)
readline.close()
if (confirmation.trim().toLowerCase() !== 'yes') {
  console.log('已取消发布，未修改任何文件。')
  process.exit(0)
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm' : 'pnpm'
if (!skipChecks) {
  if (!existsSync(resolve(projectRoot, 'node_modules', '.pnpm'))) {
    console.log('\n未发现依赖，正在安装…')
    run(pnpmCommand, ['install', '--frozen-lockfile'])
  }

  console.log('\n正在执行发布前检查…')
  run(pnpmCommand, ['exec', 'eslint', 'src', '--cache'])
  run(pnpmCommand, ['typecheck'])
}

console.log(`\n正在更新版本并创建 ${tagName}…`)
updatePackageVersion(newVersion)
run('git', ['add', '--all'])
run('git', ['commit', '-m', `chore: release ${tagName}`])
run('git', ['tag', '-a', tagName, '-m', `Lepus ${tagName}`])

console.log('\n正在原子推送 main 和版本标签…')
run('git', ['push', '--atomic', 'origin', 'HEAD:main', `refs/tags/${tagName}`])

console.log(`\n${tagName} 已推送，GitHub Actions 全平台构建已经触发。`)
console.log('构建进度：https://github.com/NeoLep/lepus/actions')
console.log(`发布页面：https://github.com/NeoLep/lepus/releases/tag/${tagName}`)
