export const FEISHU_MARKDOWN_CHUNK_LIMIT = 3_500

interface FeishuMarkdownPost {
  zh_cn: {
    title: string
    content: Array<Array<{ tag: 'md'; text: string }>>
  }
}

/**
 * Feishu renders large H1/H2 headings disproportionately in post messages.
 * Keep code blocks untouched while making AI-generated Markdown more compact.
 */
function optimizeMarkdown(markdown: string): string {
  const placeholders: string[] = []
  const marker = '___LEPUS_CODE_BLOCK_'
  let result = markdown.replace(
    /(^|\n)(`{3,})([^\n]*)\n[\s\S]*?\n\2(?=\n|$)/g,
    (match, prefix: string = '') => {
      const block = match.slice(prefix.length)
      return `${prefix}${marker}${placeholders.push(block) - 1}___`
    }
  )

  if (/^#{1,3} /m.test(markdown)) {
    result = result.replace(/^#{2,6} (.+)$/gm, '##### $1')
    result = result.replace(/^# (.+)$/gm, '#### $1')
  }

  placeholders.forEach((block, index) => {
    result = result.replace(`${marker}${index}___`, block)
  })
  return result.replace(/\n{3,}/g, '\n\n')
}

/**
 * Split Markdown without leaving an unterminated fenced code block in either
 * message. A fence crossing a boundary is closed and reopened automatically.
 */
export function splitFeishuMarkdown(
  markdown: string,
  limit = FEISHU_MARKDOWN_CHUNK_LIMIT
): string[] {
  if (markdown.length <= limit) return [markdown]

  const chunks: string[] = []
  const lines = markdown.split('\n')
  let buffer: string[] = []
  let bufferLength = 0
  let fenceLanguage: string | null = null

  const flush = (): void => {
    if (buffer.length === 0) return
    let chunk = buffer.join('\n')
    if (fenceLanguage !== null) chunk += '\n```'
    chunks.push(chunk)
    buffer = []
    bufferLength = 0
    if (fenceLanguage !== null) {
      buffer.push(`\`\`\`${fenceLanguage}`)
      bufferLength = buffer[0].length
    }
  }

  for (const line of lines) {
    const fence = line.match(/^```([^`]*)$/)
    const lineLength = line.length + (buffer.length > 0 ? 1 : 0)
    const isHeading = /^#{1,6}\s/.test(line)
    if (
      buffer.length > 0 &&
      (bufferLength + lineLength > limit || (isHeading && bufferLength > limit * 0.75))
    ) {
      flush()
    }
    buffer.push(line)
    bufferLength += line.length + (buffer.length > 1 ? 1 : 0)
    if (fence) fenceLanguage = fenceLanguage === null ? fence[1].trim() : null
  }
  flush()
  return chunks
}

export function markdownToFeishuPost(markdown: string): FeishuMarkdownPost {
  return {
    zh_cn: {
      title: '',
      content: [[{ tag: 'md', text: optimizeMarkdown(markdown) }]]
    }
  }
}

export function isFeishuFormatError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const details = error as {
    status?: unknown
    code?: unknown
    response?: { status?: unknown; data?: { code?: unknown } }
    data?: { code?: unknown }
  }
  const status = details.response?.status ?? details.status
  const code = details.response?.data?.code ?? details.data?.code ?? details.code
  return status === 400 || code === 230001 || code === 230002
}
