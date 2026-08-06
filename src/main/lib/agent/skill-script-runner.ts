import { constants as fsConstants } from 'node:fs'
import { access, copyFile, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, extname, join, resolve, sep } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { SkillDefinition } from '@/ipc/chat/constants'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const MAX_ARGUMENTS = 32
const MAX_ARGUMENT_LENGTH = 4_096
const MAX_STDIN_LENGTH = 100_000

export type SkillScriptRunInput = {
  skillId: string
  path: string
  arguments?: string[]
  stdin?: string
  timeoutMs?: number
  maxOutputBytes?: number
}

export type SkillScriptRunResult = {
  skillId: string
  path: string
  runtime: 'javascript' | 'python' | 'shell'
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  outputLimitExceeded: boolean
}

type RuntimeCommand = {
  runtime: SkillScriptRunResult['runtime']
  executable: string
  prefixArguments: string[]
  electronRunAsNode?: boolean
}

function validateArguments(values: string[] | undefined): string[] {
  if (!values) return []
  if (!Array.isArray(values) || values.length > MAX_ARGUMENTS) {
    throw new Error(`Skill 脚本参数最多 ${MAX_ARGUMENTS} 个`)
  }
  return values.map((value, index) => {
    if (typeof value !== 'string' || value.length > MAX_ARGUMENT_LENGTH) {
      throw new Error(`arguments[${index}] 必须是长度不超过 ${MAX_ARGUMENT_LENGTH} 的字符串`)
    }
    if (value.includes('\0')) throw new Error(`arguments[${index}] 包含非法空字符`)
    return value
  })
}

function validateRelativeScriptPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error('Skill 脚本路径必须是 Skill 内部的相对路径')
  }
  return normalized
}

async function findExecutable(candidates: string[]): Promise<{ executable: string; prefix: string[] }> {
  const pathDirectories = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const windowsExtensions = process.platform === 'win32' ? ['', '.exe', '.cmd'] : ['']
  for (const candidateValue of candidates) {
    const [candidate, ...prefix] = candidateValue.split(' ')
    const paths = candidate.includes(sep)
      ? [candidate]
      : pathDirectories.flatMap((directory) =>
          windowsExtensions.map((extension) => join(directory, `${candidate}${extension}`))
        )
    for (const executable of paths) {
      try {
        await access(executable, fsConstants.X_OK)
        return { executable, prefix }
      } catch {
        // Continue looking for the next explicitly allowed runtime.
      }
    }
  }
  throw new Error(`缺少脚本运行时：${candidates.join(' 或 ')}`)
}

async function resolveRuntime(scriptPath: string): Promise<RuntimeCommand> {
  const extension = extname(scriptPath).toLocaleLowerCase()
  if (['.js', '.cjs', '.mjs'].includes(extension)) {
    return {
      runtime: 'javascript',
      executable: process.execPath,
      prefixArguments: [],
      electronRunAsNode: true
    }
  }
  if (extension === '.py') {
    const command = await findExecutable(
      process.platform === 'win32' ? ['py -3', 'python', 'python3'] : ['python3', 'python']
    )
    return { runtime: 'python', executable: command.executable, prefixArguments: command.prefix }
  }
  if (extension === '.sh') {
    if (process.platform === 'win32') throw new Error('Windows 暂不支持运行 .sh Skill 脚本')
    const command = await findExecutable(['/bin/sh', '/usr/bin/sh'])
    return { runtime: 'shell', executable: command.executable, prefixArguments: [] }
  }
  throw new Error('只允许运行 .js、.cjs、.mjs、.py 或 .sh Skill 脚本')
}

async function copySkillToExecutionDirectory(
  skill: SkillDefinition,
  executionRoot: string
): Promise<void> {
  const sourceRoot = resolve(skill.rootPath)
  for (const file of skill.files) {
    const source = resolve(sourceRoot, ...file.path.split('/'))
    if (!source.startsWith(`${sourceRoot}${sep}`)) throw new Error('Skill 文件路径越过根目录')
    const sourceInfo = await lstat(source)
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
      throw new Error(`Skill 包含不可复制的文件：${file.path}`)
    }
    const destination = join(executionRoot, ...file.path.split('/'))
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
}

function terminateProcess(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid || child.killed) return
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL')
      return
    } catch {
      // Fall back to terminating the direct child.
    }
  }
  child.kill('SIGKILL')
}

function safeEnvironment(
  executionRoot: string,
  skillId: string,
  electronRunAsNode: boolean
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    LANG: process.env.LANG ?? 'C.UTF-8',
    LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? 'C.UTF-8',
    TMPDIR: executionRoot,
    TEMP: executionRoot,
    TMP: executionRoot,
    LEPUS_SKILL_ID: skillId,
    LEPUS_SKILL_ROOT: executionRoot
  }
  if (process.platform === 'win32') {
    environment.SystemRoot = process.env.SystemRoot
    environment.WINDIR = process.env.WINDIR
  }
  if (electronRunAsNode) environment.ELECTRON_RUN_AS_NODE = '1'
  return environment
}

async function executeProcess(
  command: RuntimeCommand,
  scriptPath: string,
  executionRoot: string,
  skillId: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
  maxOutputBytes: number,
  abortSignal?: AbortSignal
): Promise<Omit<SkillScriptRunResult, 'skillId' | 'path' | 'runtime'>> {
  const startedAt = Date.now()
  return new Promise((resolvePromise, reject) => {
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    let outputLimitExceeded = false
    let settled = false
    const child = spawn(
      command.executable,
      [...command.prefixArguments, scriptPath, ...args],
      {
        cwd: executionRoot,
        env: safeEnvironment(executionRoot, skillId, command.electronRunAsNode === true),
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    )
    const finish = (): void => {
      clearTimeout(timeout)
      abortSignal?.removeEventListener('abort', abort)
    }
    const abort = (): void => {
      terminateProcess(child)
      if (!settled) {
        settled = true
        finish()
        reject(new Error('Skill 脚本执行已取消'))
      }
    }
    const timeout = setTimeout(() => {
      timedOut = true
      terminateProcess(child)
    }, timeoutMs)
    const appendOutput = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
      const currentBytes = stdout.byteLength + stderr.byteLength
      const remaining = Math.max(0, maxOutputBytes - currentBytes)
      const accepted = chunk.subarray(0, remaining)
      if (target === 'stdout') stdout = Buffer.concat([stdout, accepted])
      else stderr = Buffer.concat([stderr, accepted])
      if (accepted.byteLength < chunk.byteLength || currentBytes + chunk.byteLength > maxOutputBytes) {
        outputLimitExceeded = true
        terminateProcess(child)
      }
    }

    child.stdout.on('data', (chunk: Buffer) => appendOutput('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => appendOutput('stderr', chunk))
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE' && !settled) {
        settled = true
        finish()
        terminateProcess(child)
        reject(error)
      }
    })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      finish()
      reject(error)
    })
    child.once('close', (exitCode, signal) => {
      if (settled) return
      settled = true
      finish()
      resolvePromise({
        exitCode,
        signal,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        durationMs: Date.now() - startedAt,
        timedOut,
        outputLimitExceeded
      })
    })
    abortSignal?.addEventListener('abort', abort, { once: true })
    if (abortSignal?.aborted) abort()
    if (!settled) {
      child.stdin.end(stdin)
    }
  })
}

export async function runInstalledSkillScript(
  activeSkills: SkillDefinition[],
  input: SkillScriptRunInput,
  abortSignal?: AbortSignal
): Promise<SkillScriptRunResult> {
  const skill = activeSkills.find(
    (item) => item.id === input.skillId && item.enabled && item.rootPath
  )
  if (!skill) throw new Error(`当前请求没有启用 Skill：${input.skillId}`)
  const scriptPath = validateRelativeScriptPath(input.path)
  const script = skill.files.find((file) => file.path === scriptPath && file.kind === 'script')
  if (!script) throw new Error(`路径不是已登记的 Skill 脚本：${scriptPath}`)
  const args = validateArguments(input.arguments)
  const stdin = input.stdin ?? ''
  if (typeof stdin !== 'string' || stdin.length > MAX_STDIN_LENGTH) {
    throw new Error(`stdin 长度不能超过 ${MAX_STDIN_LENGTH} 个字符`)
  }
  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS)
  const maxOutputBytes = Math.min(
    Math.max(input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES, 1),
    MAX_OUTPUT_BYTES
  )
  const runtime = await resolveRuntime(scriptPath)
  const executionRoot = await mkdtemp(join(tmpdir(), `lepus-skill-run-${skill.id}-`))
  try {
    await copySkillToExecutionDirectory(skill, executionRoot)
    const executionScriptPath = join(executionRoot, ...scriptPath.split('/'))
    const result = await executeProcess(
      runtime,
      executionScriptPath,
      executionRoot,
      skill.id,
      args,
      stdin,
      timeoutMs,
      maxOutputBytes,
      abortSignal
    )
    return { skillId: skill.id, path: scriptPath, runtime: runtime.runtime, ...result }
  } finally {
    await rm(executionRoot, { recursive: true, force: true })
  }
}
