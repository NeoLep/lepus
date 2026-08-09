import { randomUUID } from 'node:crypto'
import { clipboard, shell } from 'electron'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type {
  PermissionSettings,
  SearchProviderConfig,
  SearchProviderId,
  SkillDefinition,
  ToolApprovalRisk
} from '@/ipc/chat/constants'
import { DEFAULT_PERMISSION_SETTINGS } from '@/shared/agent/permissions'
import { calculateExpression } from './calculator'
import { applyTextPatch, type TextPatchChange } from './file-patch'
import { searchFiles, searchText } from './file-search'
import {
  copyRegularFile,
  createDirectory,
  isPathInsideWorkspace,
  listDirectory,
  moveRegularFile,
  readTextFile,
  resolveFilePath,
  validateDeleteTarget,
  writeTextFile
} from './file-system'
import { searchWeb } from './web-search'
import { compileToolParameters, formatZodError } from './tool-schema'
import { downloadFile } from './download'
import { inspectFile } from './file-inspection'
import { readInstalledSkillFile } from '../skill-installer'
import { runInstalledSkillScript } from '../skill-script-runner'
import { browserManager } from './browser-manager'
import { isTrustedBrowserUrl } from './network-security'

type JsonObject = Record<string, unknown>
type ToolExecutionContext = {
  workspacePath: string
  onProgress?: (progress: { bytesReceived: number; totalBytes?: number; percent?: number }) => void
}

export type FunctionTool = {
  schema: ChatCompletionTool
  inputSchema: ReturnType<typeof compileToolParameters>
  execute: (
    argumentsValue: JsonObject,
    signal?: AbortSignal,
    context?: ToolExecutionContext
  ) => unknown | Promise<unknown>
  approval?: { risk: ToolApprovalRisk; reason: string; allowSession?: boolean }
}

export type DelegatedTaskInput = {
  id: string
  goal: string
  context?: string
}

export type DelegateTasksHandler = (
  tasks: DelegatedTaskInput[],
  signal?: AbortSignal
) => Promise<unknown>

export type FunctionToolRuntimeOptions = {
  readOnly?: boolean
  allowBrowserTools?: boolean
  allowClipboardTool?: boolean
  allowedToolNames?: ReadonlySet<string>
  approvalFreeToolNames?: ReadonlySet<string>
  delegateTasks?: DelegateTasksHandler
  activeSkills?: SkillDefinition[]
  getTrustedBrowserOrigins?: () => string[]
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} 必须是非空字符串`)
  return value.trim()
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} 必须是字符串`)
  return value
}

function optionalInteger(value: unknown, name: string, defaultValue: number): number {
  if (value === undefined) return defaultValue
  if (!Number.isInteger(value)) throw new Error(`${name} 必须是整数`)
  return value as number
}

function optionalPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${name} 必须是大于 0 的整数`)
  }
  return value as number
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${name} 必须是布尔值`)
  return value
}

function requirePatchChanges(value: unknown): TextPatchChange[] {
  if (!Array.isArray(value) || !value.length) throw new Error('changes 必须是非空数组')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`changes[${index}] 必须是对象`)
    }
    const change = item as JsonObject
    if (typeof change['old_text'] !== 'string' || !change['old_text']) {
      throw new Error(`changes[${index}].old_text 必须是非空字符串`)
    }
    if (typeof change['new_text'] !== 'string') {
      throw new Error(`changes[${index}].new_text 必须是字符串`)
    }
    if (change['replace_all'] !== undefined && typeof change['replace_all'] !== 'boolean') {
      throw new Error(`changes[${index}].replace_all 必须是布尔值`)
    }
    return {
      oldText: change['old_text'],
      newText: change['new_text'],
      ...(change['replace_all'] === true ? { replaceAll: true } : {})
    }
  })
}

function createTool(
  name: string,
  description: string,
  parameters: JsonObject,
  execute: FunctionTool['execute'],
  approval?: FunctionTool['approval']
): FunctionTool {
  return {
    schema: { type: 'function', function: { name, description, parameters } },
    inputSchema: compileToolParameters(parameters),
    execute,
    ...(approval ? { approval } : {})
  }
}

function createBrowserTools(): FunctionTool[] {
  return [
    createTool(
      'browser_status',
      '检查可用的系统浏览器或 Lepus 浏览器组件、浏览器是否运行，并列出当前标签页。',
      { type: 'object', properties: {}, additionalProperties: false },
      () => browserManager.status()
    ),
    createTool(
      'browser_install',
      '在系统没有 Chrome、Edge、Brave 或 Chromium 时，下载并安装 Lepus 专用 Chromium 浏览器组件。仅在 browser_open 明确提示没有可用浏览器时使用；下载体积可能达到数百 MB。',
      { type: 'object', properties: {}, additionalProperties: false },
      (_arguments, signal) => browserManager.install(signal),
      {
        risk: 'high',
        reason: '将从 Playwright 官方源下载并安装数百 MB 的 Chromium 浏览器组件。',
        allowSession: false
      }
    ),
    createTool(
      'browser_open',
      '使用独立的 Lepus 浏览器会话打开公开 HTTP/HTTPS 网页并返回面向 AI 的页面快照。优先复用系统已安装的 Chromium 内核浏览器；不允许 localhost、内网或包含凭据的 URL。局域网地址必须改用 browser_open_private。',
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            minLength: 1,
            maxLength: 8192,
            description: '要打开的公开 HTTPS URL'
          }
        },
        required: ['url'],
        additionalProperties: false
      },
      ({ url }, signal) => browserManager.open(requireString(url, 'url'), signal)
    ),
    createTool(
      'browser_open_private',
      '打开用户明确要求访问的局域网 HTTP/HTTPS 页面，例如 10.x、172.16-31.x 或 192.168.x。必须使用绝对 URL；禁止 localhost、链路本地、元数据服务、URL 凭据和其他保留地址。',
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            minLength: 1,
            maxLength: 8192,
            description: '用户明确要求访问的局域网页面绝对 URL'
          }
        },
        required: ['url'],
        additionalProperties: false
      },
      ({ url }, signal) => browserManager.openPrivate(requireString(url, 'url'), signal),
      {
        risk: 'high',
        reason:
          '将允许网页自动化访问本机所在局域网中的设备或服务，请确认该地址是你希望访问的目标。',
        allowSession: false
      }
    ),
    createTool(
      'browser_tabs',
      '列出 Lepus 浏览器当前所有标签页的 tabId、标题和 URL。',
      { type: 'object', properties: {}, additionalProperties: false },
      () => browserManager.listTabs()
    ),
    createTool(
      'browser_snapshot',
      '获取指定标签页最新的 AI/ARIA 页面快照。网页变化后应重新调用，后续操作必须使用快照中的 ref。',
      {
        type: 'object',
        properties: {
          tab_id: { type: 'string', minLength: 1, maxLength: 80, description: '标签页 ID' }
        },
        required: ['tab_id'],
        additionalProperties: false
      },
      ({ tab_id: tabId }, signal) => browserManager.snapshot(requireString(tabId, 'tab_id'), signal)
    ),
    createTool(
      'browser_click',
      '点击页面快照中的元素引用。点击可能改变网站状态；执行后返回更新后的页面快照。',
      {
        type: 'object',
        properties: {
          tab_id: { type: 'string', minLength: 1, maxLength: 80 },
          ref: {
            type: 'string',
            pattern: '^e\\d+$',
            description: '最近页面快照中的元素引用，例如 e12'
          }
        },
        required: ['tab_id', 'ref'],
        additionalProperties: false
      },
      ({ tab_id: tabId, ref }, signal) =>
        browserManager.click(requireString(tabId, 'tab_id'), requireString(ref, 'ref'), signal),
      {
        risk: 'medium',
        reason: '将点击第三方网页中的元素，可能引起导航或改变网站状态。',
        allowSession: false
      }
    ),
    createTool(
      'browser_type',
      '向页面快照指定的输入控件填写文字，可选择按 Enter 提交。普通内容使用 text；request_user_input 返回的敏感凭据必须使用 secret_id，绝不能复制到 text。',
      {
        type: 'object',
        properties: {
          tab_id: { type: 'string', minLength: 1, maxLength: 80 },
          ref: { type: 'string', pattern: '^e\\d+$' },
          text: { type: 'string', maxLength: 10000, description: '要发送给网页的文字' },
          secret_id: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'request_user_input 敏感输入返回的本地临时凭据 ID'
          },
          submit: { type: 'boolean', description: '填写后是否按 Enter，默认 false' },
          sensitive: {
            type: 'boolean',
            description: '文字是否为密码或令牌；为 true 时工具记录会隐藏 text'
          }
        },
        required: ['tab_id', 'ref'],
        additionalProperties: false
      },
      ({ tab_id: tabId, ref, text, secret_id: secretId, submit }, signal) => {
        if (text === undefined) {
          throw new Error(
            typeof secretId === 'string'
              ? '敏感凭据已失效，请重新请求用户输入'
              : 'text 或有效的 secret_id 至少需要提供一个'
          )
        }
        return browserManager.type(
          requireString(tabId, 'tab_id'),
          requireString(ref, 'ref'),
          requireText(text, 'text'),
          submit === true,
          signal
        )
      },
      {
        risk: 'high',
        reason: '将把指定文字发送给第三方网页；如果同时提交，可能产生外部操作。',
        allowSession: false
      }
    ),
    createTool(
      'browser_select',
      '在页面快照指定的下拉控件中选择一个或多个值，执行后返回更新快照。',
      {
        type: 'object',
        properties: {
          tab_id: { type: 'string', minLength: 1, maxLength: 80 },
          ref: { type: 'string', pattern: '^e\\d+$' },
          values: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: { type: 'string', maxLength: 1000 }
          }
        },
        required: ['tab_id', 'ref', 'values'],
        additionalProperties: false
      },
      ({ tab_id: tabId, ref, values }, signal) =>
        browserManager.select(
          requireString(tabId, 'tab_id'),
          requireString(ref, 'ref'),
          (values as string[]).map((value) => requireText(value, 'values[]')),
          signal
        ),
      {
        risk: 'medium',
        reason: '将改变第三方网页中的表单选项。',
        allowSession: false
      }
    ),
    createTool(
      'browser_scroll',
      '滚动指定浏览器标签页并返回滚动后的最新页面快照。正数向下/向右，负数向上/向左。',
      {
        type: 'object',
        properties: {
          tab_id: { type: 'string', minLength: 1, maxLength: 80 },
          delta_x: { type: 'integer', minimum: -10000, maximum: 10000 },
          delta_y: { type: 'integer', minimum: -10000, maximum: 10000 }
        },
        required: ['tab_id', 'delta_y'],
        additionalProperties: false
      },
      ({ tab_id: tabId, delta_x: deltaX, delta_y: deltaY }) =>
        browserManager.scroll(
          requireString(tabId, 'tab_id'),
          optionalInteger(deltaX, 'delta_x', 0),
          optionalInteger(deltaY, 'delta_y', 0)
        )
    ),
    createTool(
      'browser_back',
      '让指定浏览器标签页返回上一页，并返回最新页面快照。',
      {
        type: 'object',
        properties: { tab_id: { type: 'string', minLength: 1, maxLength: 80 } },
        required: ['tab_id'],
        additionalProperties: false
      },
      ({ tab_id: tabId }, signal) => browserManager.goBack(requireString(tabId, 'tab_id'), signal)
    ),
    createTool(
      'browser_forward',
      '让指定浏览器标签页前进一页，并返回最新页面快照。',
      {
        type: 'object',
        properties: { tab_id: { type: 'string', minLength: 1, maxLength: 80 } },
        required: ['tab_id'],
        additionalProperties: false
      },
      ({ tab_id: tabId }, signal) =>
        browserManager.goForward(requireString(tabId, 'tab_id'), signal)
    ),
    createTool(
      'browser_screenshot',
      '将指定网页截图保存到安全工作文件夹的 .lepus/browser-screenshots 目录。',
      {
        type: 'object',
        properties: {
          tab_id: { type: 'string', minLength: 1, maxLength: 80 },
          filename: {
            type: 'string',
            maxLength: 180,
            description: '可选 PNG 文件名；省略时自动生成且不会覆盖'
          },
          full_page: { type: 'boolean', description: '是否截取完整页面，默认 false' }
        },
        required: ['tab_id'],
        additionalProperties: false
      },
      ({ tab_id: tabId, filename, full_page: fullPage }, signal, context) =>
        browserManager.screenshot(
          requireString(tabId, 'tab_id'),
          context?.workspacePath ?? '',
          typeof filename === 'string' ? filename : undefined,
          fullPage === true,
          signal
        ),
      {
        risk: 'high',
        reason: '将捕获第三方网页画面，并把 PNG 文件写入安全工作文件夹。',
        allowSession: false
      }
    ),
    createTool(
      'browser_close',
      '关闭指定的 Lepus 浏览器标签页。',
      {
        type: 'object',
        properties: { tab_id: { type: 'string', minLength: 1, maxLength: 80 } },
        required: ['tab_id'],
        additionalProperties: false
      },
      ({ tab_id: tabId }) => browserManager.closeTab(requireString(tabId, 'tab_id'))
    )
  ]
}

const baseTools = [
  createTool(
    'clipboard_read_text',
    '读取系统剪切板中的纯文本。仅当用户明确要求读取、粘贴、总结或处理剪切板内容时使用；不得主动或后台读取。结果最多返回 100,000 个字符。',
    { type: 'object', properties: {}, additionalProperties: false },
    () => {
      const text = clipboard.readText()
      const maximumCharacters = 100_000
      const truncated = text.length > maximumCharacters
      return {
        text: truncated ? text.slice(0, maximumCharacters) : text,
        characterCount: text.length,
        truncated,
        formats: clipboard.availableFormats()
      }
    },
    {
      risk: 'high',
      reason: '将读取系统剪切板中的文本并加入当前对话记录；其中可能包含密码、令牌或其他敏感信息。',
      allowSession: false
    }
  ),
  createTool(
    'inspect_file',
    '安全检查普通文件的元数据、真实文件头类型、扩展名一致性和 SHA-256。不会执行文件，也不会预览或解压压缩包。',
    {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 4096, description: '要检查的文件路径' },
        include_hash: { type: 'boolean', description: '是否计算完整文件 SHA-256，默认 true' }
      },
      required: ['path'],
      additionalProperties: false
    },
    ({ path: filePath, include_hash: includeHash }, signal, context) =>
      inspectFile(
        {
          path: filePath as string,
          workspacePath: context?.workspacePath ?? '',
          includeHash: includeHash as boolean | undefined
        },
        signal
      ),
    { risk: 'high', reason: '将读取文件头和元数据，并可能读取完整文件来计算 SHA-256。' }
  ),
  createTool(
    'download_file',
    '通过 HTTPS 流式下载公开互联网资源到工作文件夹。不会覆盖、执行或解压文件；会返回大小、MIME、SHA-256 和最终 URL。',
    {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, maxLength: 8192, description: '公开 HTTPS 资源 URL' },
        destination_path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '可选目标路径，相对于工作文件夹；省略时使用安全化后的服务器文件名'
        },
        max_bytes: {
          type: 'integer',
          minimum: 1,
          maximum: 524288000,
          description: '下载大小上限，默认 50 MiB，最大 500 MiB'
        }
      },
      required: ['url'],
      additionalProperties: false
    },
    ({ url, destination_path: destinationPath, max_bytes: maxBytes }, signal, context) =>
      downloadFile(
        {
          url: url as string,
          destinationPath: destinationPath as string | undefined,
          workspacePath: context?.workspacePath ?? '',
          maxBytes: maxBytes as number | undefined
        },
        signal,
        context?.onProgress
      ),
    {
      risk: 'high',
      reason: '将从互联网下载资源并写入本机工作文件夹。请确认来源 URL、目标路径和大小上限。'
    }
  ),
  createTool(
    'get_current_time',
    '获取当前日期和时间。用户询问当前时间、日期或某个时区的时间时使用。',
    {
      type: 'object',
      properties: {
        time_zone: {
          type: 'string',
          description: '可选的 IANA 时区名称，例如 Asia/Shanghai、Europe/London'
        }
      },
      additionalProperties: false
    },
    ({ time_zone: timeZone }) => {
      if (timeZone !== undefined && typeof timeZone !== 'string') {
        throw new Error('time_zone 必须是字符串')
      }
      const resolvedTimeZone = timeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone
      const now = new Date()
      let localTime: string
      try {
        localTime = new Intl.DateTimeFormat('zh-CN', {
          timeZone: resolvedTimeZone,
          dateStyle: 'full',
          timeStyle: 'long'
        }).format(now)
      } catch {
        throw new Error(`无效的时区：${resolvedTimeZone}`)
      }
      return { iso: now.toISOString(), timeZone: resolvedTimeZone, localTime }
    }
  ),
  createTool(
    'calculate',
    '安全地计算算术表达式。支持括号、+、-、*、/、%、^ 和科学计数法。',
    {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '要计算的算术表达式，例如 (12.5 + 7.5) * 3' }
      },
      required: ['expression'],
      additionalProperties: false
    },
    ({ expression }) => ({
      expression,
      result: calculateExpression(requireString(expression, 'expression'))
    })
  ),
  createTool(
    'generate_uuid',
    '生成一个随机 UUID v4。用户需要唯一标识符、请求 ID 或示例 UUID 时使用。',
    { type: 'object', properties: {}, additionalProperties: false },
    () => ({ uuid: randomUUID() })
  ),
  createTool(
    'update_plan',
    '创建或更新当前任务的执行计划。开始多步骤任务、步骤状态变化或任务完成时使用；每次提交完整计划。',
    {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          maxLength: 500,
          description: '可选的简短计划说明或状态变化原因'
        },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                minLength: 1,
                maxLength: 80,
                description: '稳定的步骤 ID，后续更新时保持不变'
              },
              title: { type: 'string', minLength: 1, maxLength: 200 },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'skipped']
              }
            },
            required: ['id', 'title', 'status'],
            additionalProperties: false
          }
        }
      },
      required: ['items'],
      additionalProperties: false
    },
    ({ explanation, items }) => {
      const planItems = items as Array<{ id: string; title: string; status: string }>
      if (planItems.filter((item) => item.status === 'in_progress').length > 1) {
        throw new Error('计划中最多只能有一个进行中的步骤')
      }
      if (new Set(planItems.map((item) => item.id)).size !== planItems.length) {
        throw new Error('计划步骤 ID 不能重复')
      }
      return { explanation: typeof explanation === 'string' ? explanation.trim() : '', items }
    }
  ),
  createTool(
    'request_user_input',
    '暂停当前执行并通过界面向用户提出一个简短问题，获得回答后在同一轮中继续工作。执行途中缺少必要信息时必须使用此工具，不要用普通助手文本提问。可提供 2 到 5 个互斥选项，也可以允许用户自由填写；密码或令牌必须设置 sensitive=true。',
    {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: '清晰、具体且一次只询问一个决策的问题'
        },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 80 },
              label: { type: 'string', minLength: 1, maxLength: 120 },
              description: { type: 'string', maxLength: 300 }
            },
            required: ['id', 'label'],
            additionalProperties: false
          },
          description: '可选的互斥选项；不提供时必须允许自由填写'
        },
        allow_freeform: {
          type: 'boolean',
          description: '是否允许用户自己填写答案，默认 true'
        },
        sensitive: {
          type: 'boolean',
          description: '答案是否为密码、令牌等敏感信息；敏感输入会隐藏显示且不会保存明文'
        },
        placeholder: {
          type: 'string',
          maxLength: 200,
          description: '自由输入框的可选提示文字'
        }
      },
      required: ['question'],
      additionalProperties: false
    },
    ({ question, options, allow_freeform: allowFreeform, sensitive, placeholder }) => {
      const normalizedOptions = (options ?? []) as Array<{
        id: string
        label: string
        description?: string
      }>
      const canWrite = allowFreeform !== false
      if (!normalizedOptions.length && !canWrite) {
        throw new Error('没有选项时必须允许用户自由填写')
      }
      if (new Set(normalizedOptions.map((option) => option.id)).size !== normalizedOptions.length) {
        throw new Error('选项 ID 不能重复')
      }
      return {
        question: String(question).trim(),
        options: normalizedOptions,
        allowFreeform: canWrite,
        sensitive: sensitive === true,
        ...(typeof placeholder === 'string' && placeholder.trim()
          ? { placeholder: placeholder.trim() }
          : {})
      }
    }
  ),
  createTool(
    'search_files',
    '在工作文件夹或指定目录中按 Glob 查找文件。默认忽略依赖、版本控制和构建目录，不跟随符号链接。',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: '搜索根目录，相对于工作文件夹，例如 .' },
        pattern: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Glob 模式，例如 **/*.ts、src/**/index.*'
        },
        include_hidden: { type: 'boolean', description: '是否包含隐藏文件，默认 false' },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: '最多返回结果数量，默认 100'
        }
      },
      required: ['path', 'pattern'],
      additionalProperties: false
    },
    (
      { path: searchPath, pattern, include_hidden: includeHidden, max_results: maxResults },
      signal,
      context
    ) =>
      searchFiles(
        {
          path: requireString(searchPath, 'path'),
          workspacePath: context?.workspacePath ?? '',
          pattern: requireString(pattern, 'pattern'),
          includeHidden: optionalBoolean(includeHidden, 'include_hidden'),
          maxResults: optionalPositiveInteger(maxResults, 'max_results')
        },
        signal
      ),
    {
      risk: 'high',
      reason: '将遍历本机文件夹中的文件名。请确认搜索目录和模式。'
    }
  ),
  createTool(
    'search_text',
    '在文本文件中搜索普通文本或正则表达式，返回文件路径、行列和预览。默认忽略依赖、版本控制、构建目录、二进制和超大文件。',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: '搜索根目录，相对于工作文件夹，例如 .' },
        query: { type: 'string', minLength: 1, maxLength: 1000, description: '搜索文本或正则' },
        file_pattern: {
          type: 'string',
          maxLength: 500,
          description: '可选文件 Glob，默认 **/*'
        },
        use_regex: { type: 'boolean', description: '是否将 query 作为正则，默认 false' },
        case_sensitive: { type: 'boolean', description: '是否区分大小写，默认 false' },
        include_hidden: { type: 'boolean', description: '是否包含隐藏文件，默认 false' },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: '最多返回匹配数量，默认 100'
        }
      },
      required: ['path', 'query'],
      additionalProperties: false
    },
    (
      {
        path: searchPath,
        query,
        file_pattern: filePattern,
        use_regex: useRegex,
        case_sensitive: caseSensitive,
        include_hidden: includeHidden,
        max_results: maxResults
      },
      signal,
      context
    ) =>
      searchText(
        {
          path: requireString(searchPath, 'path'),
          workspacePath: context?.workspacePath ?? '',
          query: requireString(query, 'query'),
          ...(filePattern === undefined
            ? {}
            : { filePattern: requireString(filePattern, 'file_pattern') }),
          useRegex: optionalBoolean(useRegex, 'use_regex'),
          caseSensitive: optionalBoolean(caseSensitive, 'case_sensitive'),
          includeHidden: optionalBoolean(includeHidden, 'include_hidden'),
          maxResults: optionalPositiveInteger(maxResults, 'max_results')
        },
        signal
      ),
    {
      risk: 'high',
      reason: '将读取并搜索本机目录中的文本文件。请确认搜索目录和查询内容。'
    }
  ),
  createTool(
    'apply_patch',
    '对现有 UTF-8 文本文件应用精确补丁。每项修改使用 old_text 和 new_text；默认要求 old_text 在当前文件中唯一匹配，避免修改错误位置。',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要修改的文件路径，相对于工作文件夹' },
        changes: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              old_text: {
                type: 'string',
                minLength: 1,
                maxLength: 500000,
                description: '文件中必须精确存在的原文本'
              },
              new_text: {
                type: 'string',
                maxLength: 500000,
                description: '替换后的新文本；空字符串表示删除'
              },
              replace_all: {
                type: 'boolean',
                description: '是否替换所有匹配，默认 false；关闭时要求唯一匹配'
              }
            },
            required: ['old_text', 'new_text'],
            additionalProperties: false
          }
        }
      },
      required: ['path', 'changes'],
      additionalProperties: false
    },
    ({ path: filePath, changes }, signal, context) =>
      applyTextPatch(
        {
          path: requireString(filePath, 'path'),
          workspacePath: context?.workspacePath ?? '',
          changes: requirePatchChanges(changes)
        },
        signal
      ),
    {
      risk: 'high',
      reason: '将修改本机文本文件，并在完成后生成差异记录。请确认文件路径和修改内容。'
    }
  ),
  createTool(
    'read_file',
    '读取 UTF-8 文本文件。仅在用户明确要求查看文件内容时使用。优先使用相对于工作文件夹的路径，可指定起止行避免读取无关内容。',
    {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '相对于工作文件夹的路径；访问外部文件时也可使用绝对路径'
        },
        start_line: { type: 'integer', minimum: 1, description: '可选，起始行（从 1 开始）' },
        end_line: { type: 'integer', minimum: 1, description: '可选，结束行（包含）' },
        max_characters: {
          type: 'integer',
          minimum: 1,
          maximum: 500000,
          description: '最多返回的字符数，默认 100000'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    (
      { path: filePath, start_line: startLine, end_line: endLine, max_characters: maxCharacters },
      signal,
      context
    ) =>
      readTextFile(
        {
          path: requireString(filePath, 'path'),
          workspacePath: context?.workspacePath ?? '',
          startLine: optionalPositiveInteger(startLine, 'start_line'),
          endLine: optionalPositiveInteger(endLine, 'end_line'),
          maxCharacters: optionalPositiveInteger(maxCharacters, 'max_characters')
        },
        signal
      ),
    {
      risk: 'high',
      reason: '将读取本机文件内容，可能涉及隐私、凭据或其他敏感信息。请确认路径和读取范围。'
    }
  ),
  createTool(
    'write_file',
    '写入 UTF-8 文本文件。优先使用相对于工作文件夹的路径，并明确指定 create（仅新建）、overwrite（覆盖）或 append（追加）模式。',
    {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '相对于工作文件夹的路径；访问外部文件时也可使用绝对路径'
        },
        content: {
          type: 'string',
          maxLength: 1048576,
          description: '要写入的完整文本内容，最大 1 MiB'
        },
        mode: {
          type: 'string',
          enum: ['create', 'overwrite', 'append'],
          description: 'create 仅新建；overwrite 覆盖已有文件；append 追加到文件末尾'
        }
      },
      required: ['path', 'content', 'mode'],
      additionalProperties: false
    },
    ({ path: filePath, content, mode }, signal, context) => {
      const normalizedMode = requireString(mode, 'mode')
      if (!['create', 'overwrite', 'append'].includes(normalizedMode)) {
        throw new Error('mode 必须是 create、overwrite 或 append')
      }
      return writeTextFile(
        {
          path: requireString(filePath, 'path'),
          workspacePath: context?.workspacePath ?? '',
          content: requireText(content, 'content'),
          mode: normalizedMode as 'create' | 'overwrite' | 'append'
        },
        signal
      )
    },
    {
      risk: 'high',
      reason: '将修改本机文件系统。请仔细确认目标路径、写入模式和内容，覆盖操作可能导致原内容丢失。'
    }
  ),
  createTool(
    'copy_file',
    '复制普通文件。源和目标优先使用相对于工作文件夹的路径；不会跟随符号链接，也不会覆盖已存在的目标。',
    {
      type: 'object',
      properties: {
        source_path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '源文件路径'
        },
        destination_path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '目标文件的完整路径，目标不能已存在'
        }
      },
      required: ['source_path', 'destination_path'],
      additionalProperties: false
    },
    ({ source_path: sourcePath, destination_path: destinationPath }, signal, context) =>
      copyRegularFile(
        {
          sourcePath: requireString(sourcePath, 'source_path'),
          destinationPath: requireString(destinationPath, 'destination_path'),
          workspacePath: context?.workspacePath ?? ''
        },
        signal
      ),
    {
      risk: 'high',
      reason: '将复制本机文件。请确认源路径和目标路径。'
    }
  ),
  createTool(
    'move_file',
    '移动或重命名普通文件。源和目标优先使用相对于工作文件夹的路径；不会跟随符号链接，也不会覆盖已存在的目标。',
    {
      type: 'object',
      properties: {
        source_path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '源文件路径'
        },
        destination_path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '目标文件的完整路径，目标不能已存在'
        }
      },
      required: ['source_path', 'destination_path'],
      additionalProperties: false
    },
    ({ source_path: sourcePath, destination_path: destinationPath }, signal, context) =>
      moveRegularFile(
        {
          sourcePath: requireString(sourcePath, 'source_path'),
          destinationPath: requireString(destinationPath, 'destination_path'),
          workspacePath: context?.workspacePath ?? ''
        },
        signal
      ),
    {
      risk: 'high',
      reason: '将移动本机文件，源路径中的文件会消失。请确认源路径和目标路径。'
    }
  ),
  createTool(
    'list_directory',
    '列出文件夹中的文件和子文件夹。优先使用相对于工作文件夹的路径，可选择是否包含隐藏项并限制返回数量。',
    {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '相对于工作文件夹的目录路径；访问外部目录时也可使用绝对路径'
        },
        include_hidden: {
          type: 'boolean',
          description: '是否包含以点开头的隐藏项，默认 false'
        },
        max_entries: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: '最多返回的目录项数量，默认 200'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    (
      { path: directoryPath, include_hidden: includeHidden, max_entries: maxEntries },
      signal,
      context
    ) =>
      listDirectory(
        {
          path: requireString(directoryPath, 'path'),
          workspacePath: context?.workspacePath ?? '',
          includeHidden: optionalBoolean(includeHidden, 'include_hidden'),
          maxEntries: optionalPositiveInteger(maxEntries, 'max_entries')
        },
        signal
      ),
    {
      risk: 'high',
      reason: '将读取本机文件夹结构，可能暴露敏感文件名和目录信息。'
    }
  ),
  createTool(
    'delete_path',
    '删除文件或文件夹。目标会移动到系统废纸篓而不是永久删除；禁止删除磁盘根目录、用户主目录、工作文件夹及其父目录。',
    {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '要移入系统废纸篓的文件或文件夹路径'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    async ({ path: targetPath }, signal, context) => {
      signal?.throwIfAborted()
      const target = await validateDeleteTarget({
        path: requireString(targetPath, 'path'),
        workspacePath: context?.workspacePath ?? ''
      })
      signal?.throwIfAborted()
      await shell.trashItem(target.path)
      return { ...target, trashed: true, recoverable: true }
    },
    {
      risk: 'high',
      reason: '将把本机文件或文件夹移动到系统废纸篓。请确认目标路径。'
    }
  ),
  createTool(
    'create_directory',
    '创建文件夹。优先使用相对于工作文件夹的路径；默认只创建单层目录，可通过 recursive 同时创建缺失的父目录。',
    {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
          description: '要创建的文件夹路径'
        },
        recursive: {
          type: 'boolean',
          description: '是否递归创建缺失的父目录，默认 false'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    ({ path: directoryPath, recursive }, signal, context) =>
      createDirectory(
        {
          path: requireString(directoryPath, 'path'),
          workspacePath: context?.workspacePath ?? '',
          recursive: optionalBoolean(recursive, 'recursive')
        },
        signal
      ),
    {
      risk: 'high',
      reason: '将在本机文件系统中创建文件夹。请确认目标路径和是否递归创建父目录。'
    }
  )
] satisfies FunctionTool[]

function createSearchTool(configs: SearchProviderConfig[]): FunctionTool | null {
  const enabledConfigs = configs.filter((config) => config.enabled)
  if (!enabledConfigs.length) return null
  const configByProvider = new Map(enabledConfigs.map((config) => [config.provider, config]))
  const providers = enabledConfigs.map((config) => config.provider)
  return createTool(
    'search_web',
    `搜索公开互联网，返回网页标题、链接和摘要。当前可用服务：${providers.join(', ')}。涉及新闻、时效性信息或需要来源时使用。`,
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: '简洁、具体的搜索关键词，不要包含敏感信息' },
        provider: {
          type: 'string',
          enum: providers,
          description: '使用的搜索服务；省略时使用第一个已启用服务'
        },
        max_results: {
          type: 'integer',
          description: '返回结果数量，默认为 5',
          minimum: 1,
          maximum: 10
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    async ({ query, provider, max_results: maxResults }, signal) => {
      const normalizedQuery = requireString(query, 'query')
      if (normalizedQuery.length > 500) throw new Error('query 不能超过 500 个字符')
      const selectedProvider =
        provider === undefined ? providers[0] : requireString(provider, 'provider')
      const config = configByProvider.get(selectedProvider as SearchProviderId)
      if (!config) throw new Error(`搜索服务未启用：${selectedProvider}`)
      const limit = optionalInteger(maxResults, 'max_results', 5)
      if (limit < 1 || limit > 10) throw new Error('max_results 必须在 1 到 10 之间')
      return searchWeb(normalizedQuery, limit, config, signal)
    },
    {
      risk: 'medium',
      reason: '将把搜索关键词发送给已配置的第三方互联网搜索服务。'
    }
  )
}

function createDelegateTasksTool(delegateTasks: DelegateTasksHandler): FunctionTool {
  return createTool(
    'delegate_tasks',
    '将彼此独立的只读分析任务委派给受控子 Agent。最多 4 个任务、同时运行 2 个；子 Agent 不能修改文件或继续委派。请为每个任务提供完成所需的明确目标和最小上下文。',
    {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                minLength: 1,
                maxLength: 80,
                description: '当前委派批次内唯一且稳定的任务 ID'
              },
              goal: {
                type: 'string',
                minLength: 1,
                maxLength: 2_000,
                description: '子 Agent 要独立完成的具体目标'
              },
              context: {
                type: 'string',
                maxLength: 8_000,
                description: '完成任务所需的最小背景、路径或约束；不要粘贴无关对话历史'
              }
            },
            required: ['id', 'goal'],
            additionalProperties: false
          }
        }
      },
      required: ['tasks'],
      additionalProperties: false
    },
    async ({ tasks }, signal) => {
      const normalizedTasks = (tasks as DelegatedTaskInput[]).map((task) => ({
        id: task.id.trim(),
        goal: task.goal.trim(),
        ...(task.context?.trim() ? { context: task.context.trim() } : {})
      }))
      if (normalizedTasks.some((task) => !task.id || !task.goal)) {
        throw new Error('子任务 ID 和目标不能为空')
      }
      if (new Set(normalizedTasks.map((task) => task.id)).size !== normalizedTasks.length) {
        throw new Error('子任务 ID 不能重复')
      }
      return delegateTasks(normalizedTasks, signal)
    }
  )
}

function parseArguments(rawArguments: string): JsonObject {
  const parsed: unknown = JSON.parse(rawArguments || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('工具参数必须是 JSON 对象')
  }
  return parsed as JsonObject
}

function containsSensitiveValue(value: string): boolean {
  return /(\.env|\.ssh|\.aws|\.git|\.npmrc|\.netrc|\.docker|\.kube|credentials?|secrets?|id_rsa|id_ed25519|keychain|passwords?|api[\s_-]*keys?|private[\s_-]*keys?|access[\s_-]*tokens?|\/etc\/(passwd|shadow|sudoers)|cookies?)/i.test(
    value
  )
}

const FILE_TOOL_NAMES = new Set([
  'download_file',
  'inspect_file',
  'search_files',
  'search_text',
  'apply_patch',
  'read_file',
  'write_file',
  'list_directory',
  'delete_path',
  'create_directory',
  'copy_file',
  'move_file'
])

export function createFunctionToolRuntime(
  searchConfigs: SearchProviderConfig[],
  permissionSettings: PermissionSettings = DEFAULT_PERMISSION_SETTINGS,
  taskMode = false,
  options: FunctionToolRuntimeOptions = {}
) {
  const searchTool = createSearchTool(searchConfigs)
  const safeTools = baseTools.filter((tool) => {
    const name = tool.schema.type === 'function' ? tool.schema.function.name : ''
    return (
      !FILE_TOOL_NAMES.has(name) &&
      name !== 'update_plan' &&
      !(
        options.readOnly &&
        (name === 'request_user_input' ||
          (name === 'clipboard_read_text' && !options.allowClipboardTool))
      )
    )
  })
  const taskTools = taskMode
    ? baseTools.filter(
        (tool) => tool.schema.type === 'function' && tool.schema.function.name === 'update_plan'
      )
    : []
  const readOnlyFileToolNames = new Set([
    'inspect_file',
    'search_files',
    'search_text',
    'read_file',
    'list_directory'
  ])
  const fileTools = permissionSettings.workspacePath
    ? baseTools.filter((tool) => {
        const name = tool.schema.type === 'function' ? tool.schema.function.name : ''
        return FILE_TOOL_NAMES.has(name) && (!options.readOnly || readOnlyFileToolNames.has(name))
      })
    : []
  const delegateTool = options.delegateTasks ? createDelegateTasksTool(options.delegateTasks) : null
  const browserTools = options.readOnly && !options.allowBrowserTools ? [] : createBrowserTools()
  const skillFileTool = options.activeSkills?.some((skill) => skill.rootPath)
    ? createTool(
        'read_skill_file',
        '读取当前请求已启用 Skill 中的 references、scripts 或文本 assets。只能读取导入时登记的文件，不会执行脚本。',
        {
          type: 'object',
          properties: {
            skill_id: { type: 'string', minLength: 1, maxLength: 64 },
            path: { type: 'string', minLength: 1, maxLength: 4096 },
            max_characters: { type: 'integer', minimum: 1, maximum: 500000 }
          },
          required: ['skill_id', 'path'],
          additionalProperties: false
        },
        ({ skill_id: skillId, path: filePath, max_characters: maxCharacters }) =>
          readInstalledSkillFile(
            options.activeSkills ?? [],
            requireString(skillId, 'skill_id'),
            requireString(filePath, 'path'),
            optionalPositiveInteger(maxCharacters, 'max_characters')
          )
      )
    : null
  const skillScriptTool =
    !options.readOnly &&
    options.activeSkills?.some((skill) => skill.files.some((file) => file.kind === 'script'))
      ? createTool(
          'run_skill_script',
          '在临时副本中运行当前请求已启用 Skill 的已登记脚本。不会通过 shell 拼接参数，不继承 API Key 等应用环境变量，支持超时、取消和输出限制。脚本仍是第三方代码，每次调用都需要用户确认。',
          {
            type: 'object',
            properties: {
              skill_id: {
                type: 'string',
                minLength: 1,
                maxLength: 64,
                description: '当前请求已启用的 Skill ID'
              },
              path: {
                type: 'string',
                minLength: 1,
                maxLength: 4096,
                description: 'Skill 文件清单中 scripts/ 下的相对路径'
              },
              args: {
                type: 'array',
                maxItems: 32,
                items: { type: 'string', maxLength: 4096 },
                description: '直接传给脚本运行时的参数数组，不经过 shell 解析'
              },
              stdin: {
                type: 'string',
                maxLength: 100000,
                description: '可选标准输入文本'
              },
              timeout_ms: {
                type: 'integer',
                minimum: 1,
                maximum: 120000,
                description: '超时时间，默认 30000 毫秒，最大 120000'
              },
              max_output_bytes: {
                type: 'integer',
                minimum: 1,
                maximum: 2097152,
                description: 'stdout 与 stderr 合计上限，默认 1 MiB，最大 2 MiB'
              }
            },
            required: ['skill_id', 'path'],
            additionalProperties: false
          },
          (
            {
              skill_id: skillId,
              path: scriptPath,
              args,
              stdin,
              timeout_ms: timeoutMs,
              max_output_bytes: maxOutputBytes
            },
            signal
          ) =>
            runInstalledSkillScript(
              options.activeSkills ?? [],
              {
                skillId: requireString(skillId, 'skill_id'),
                path: requireString(scriptPath, 'path'),
                arguments: args as string[] | undefined,
                stdin: stdin as string | undefined,
                timeoutMs: timeoutMs as number | undefined,
                maxOutputBytes: maxOutputBytes as number | undefined
              },
              signal
            ),
          {
            risk: 'high',
            reason:
              '将运行已安装 Skill 附带的第三方代码。脚本会在临时副本中启动，但仍可能访问网络或本机可访问的文件。',
            allowSession: false
          }
        )
      : null
  const availableTools = [
    ...safeTools,
    ...taskTools,
    ...fileTools,
    ...browserTools,
    ...(searchTool ? [searchTool] : []),
    ...(skillFileTool ? [skillFileTool] : []),
    ...(skillScriptTool ? [skillScriptTool] : []),
    ...(delegateTool ? [delegateTool] : [])
  ]
  const tools = options.allowedToolNames
    ? availableTools.filter(
        (tool) =>
          tool.schema.type === 'function' &&
          options.allowedToolNames?.has(tool.schema.function.name)
      )
    : availableTools
  const toolMap = new Map(
    tools.map((tool) => {
      if (tool.schema.type !== 'function') throw new Error('仅支持 function 类型工具')
      return [tool.schema.function.name, tool] as const
    })
  )
  return {
    schemas: tools.map((tool) => tool.schema),
    getApproval(name: string, rawArguments: string): FunctionTool['approval'] {
      const tool = toolMap.get(name)
      if (!tool) return undefined
      let validatedArguments: JsonObject
      try {
        const validation = tool.inputSchema.safeParse(parseArguments(rawArguments))
        if (!validation.success) return tool.approval
        validatedArguments = validation.data
      } catch {
        return tool.approval
      }

      if (options.approvalFreeToolNames?.has(name)) return undefined

      if (name === 'search_web') {
        if (permissionSettings.mode === 'full_access') return undefined
        if (permissionSettings.mode === 'auto_approve') {
          try {
            const query = String(validatedArguments['query'] ?? '')
            if (!containsSensitiveValue(query)) return undefined
          } catch {
            return tool.approval
          }
        }
        return {
          risk: 'medium',
          reason: '将把搜索关键词发送给已配置的第三方互联网搜索服务。',
          allowSession: false
        }
      }

      if (name === 'browser_open_private') {
        const url = String(validatedArguments['url'] ?? '')
        const trustedOrigins =
          options.getTrustedBrowserOrigins?.() ?? permissionSettings.trustedBrowserOrigins
        return isTrustedBrowserUrl(url, trustedOrigins) ? undefined : tool.approval
      }

      if (['browser_click', 'browser_type', 'browser_select'].includes(name)) {
        try {
          const tabId = requireString(validatedArguments['tab_id'], 'tab_id')
          const trustedOrigins =
            options.getTrustedBrowserOrigins?.() ?? permissionSettings.trustedBrowserOrigins
          return isTrustedBrowserUrl(browserManager.tabUrl(tabId), trustedOrigins)
            ? undefined
            : tool.approval
        } catch {
          return tool.approval
        }
      }

      if (name === 'download_file') {
        const sourceUrl = String(validatedArguments['url'] ?? '')
        const requestedDestination = String(validatedArguments['destination_path'] ?? '').trim()
        let inferredName = requestedDestination
        try {
          inferredName ||= decodeURIComponent(new URL(sourceUrl).pathname.split('/').at(-1) ?? '')
        } catch {
          return tool.approval
        }
        const destinationPath = resolveFilePath(
          requestedDestination || inferredName || 'download',
          permissionSettings.workspacePath
        )
        if (!isPathInsideWorkspace(destinationPath, permissionSettings.workspacePath)) {
          return {
            risk: 'high',
            reason: `下载目标位于安全工作文件夹之外，写入前必须确认：${destinationPath}`,
            allowSession: false
          }
        }
        if (permissionSettings.mode === 'request_approval') return tool.approval
        const dangerousExtension =
          /\.(?:app|apk|bat|cmd|com|dmg|exe|iso|jar|js|msi|pkg|ps1|rar|sh|tar|tgz|xz|zip|7z)$/i.test(
            inferredName
          )
        if (dangerousExtension) {
          return {
            risk: 'high',
            reason: '下载目标是可执行文件、脚本或压缩包；即使不会自动运行或解压，也需要确认。',
            allowSession: false
          }
        }
        return undefined
      }

      if (name === 'copy_file' || name === 'move_file') {
        try {
          const parsed = validatedArguments
          const sourcePath = resolveFilePath(
            requireString(parsed['source_path'], 'source_path'),
            permissionSettings.workspacePath
          )
          const destinationPath = resolveFilePath(
            requireString(parsed['destination_path'], 'destination_path'),
            permissionSettings.workspacePath
          )
          const sourceInside = isPathInsideWorkspace(sourcePath, permissionSettings.workspacePath)
          const destinationInside = isPathInsideWorkspace(
            destinationPath,
            permissionSettings.workspacePath
          )

          if (!destinationInside) {
            return {
              risk: 'high',
              reason: `目标位于安全工作文件夹之外，${name === 'copy_file' ? '复制' : '移动'}前必须确认：${destinationPath}`,
              allowSession: false
            }
          }
          if (name === 'move_file' && !sourceInside) {
            return {
              risk: 'high',
              reason: `移动会移除安全工作文件夹之外的源文件，必须确认：${sourcePath}`,
              allowSession: false
            }
          }
          if (sourceInside) return undefined
          if (permissionSettings.mode === 'full_access') return undefined
          if (permissionSettings.mode === 'auto_approve' && !containsSensitiveValue(sourcePath)) {
            return undefined
          }
          return {
            risk: 'high',
            reason: `复制前将读取安全工作文件夹之外的文件：${sourcePath}`,
            allowSession: false
          }
        } catch {
          return tool.approval
        }
      }

      if (FILE_TOOL_NAMES.has(name)) {
        try {
          const requestedPath = requireString(validatedArguments['path'], 'path')
          const targetPath = resolveFilePath(requestedPath, permissionSettings.workspacePath)
          const insideWorkspace = isPathInsideWorkspace(
            targetPath,
            permissionSettings.workspacePath
          )
          if (name === 'delete_path') {
            if (insideWorkspace && permissionSettings.mode === 'full_access') return undefined
            return {
              risk: 'high',
              reason: insideWorkspace
                ? `将把安全工作文件夹内的目标移动到系统废纸篓：${targetPath}`
                : `目标位于安全工作文件夹之外，删除前必须确认：${targetPath}`,
              allowSession: false
            }
          }

          if (insideWorkspace) return undefined

          if (name === 'write_file' || name === 'create_directory' || name === 'apply_patch') {
            return {
              risk: 'high',
              reason:
                name === 'create_directory'
                  ? `目标位于安全工作文件夹之外，创建文件夹前必须确认：${targetPath}`
                  : name === 'apply_patch'
                    ? `目标位于安全工作文件夹之外，应用补丁前必须确认：${targetPath}`
                    : `目标位于安全工作文件夹之外，写入前必须确认：${targetPath}`,
              allowSession: false
            }
          }
          if (permissionSettings.mode === 'full_access') return undefined
          if (permissionSettings.mode === 'auto_approve' && !containsSensitiveValue(targetPath)) {
            return undefined
          }
          return {
            risk: 'high',
            reason:
              name === 'list_directory' || name === 'search_files' || name === 'search_text'
                ? `将读取安全工作文件夹之外的目录结构：${targetPath}`
                : `将读取安全工作文件夹之外的文件：${targetPath}`,
            allowSession: false
          }
        } catch {
          return tool.approval
        }
      }

      return tool.approval
    },
    async execute(
      name: string,
      rawArguments: string,
      signal?: AbortSignal,
      onProgress?: ToolExecutionContext['onProgress']
    ): Promise<string> {
      const tool = toolMap.get(name)
      if (!tool) return JSON.stringify({ ok: false, error: `未知工具：${name}` })

      try {
        const raw = parseArguments(rawArguments)
        const validation = tool.inputSchema.safeParse(raw)
        if (!validation.success)
          throw new Error(`工具参数无效：${formatZodError(validation.error)}`)
        const parsed = validation.data
        const data = await tool.execute(parsed, signal, {
          workspacePath: permissionSettings.workspacePath,
          onProgress
        })
        return JSON.stringify({ ok: true, data })
      } catch (error) {
        return JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
}
