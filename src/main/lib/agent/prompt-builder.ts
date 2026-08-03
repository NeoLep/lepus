import type { ChatLocale, PromptSettings } from '@/ipc/chat/constants'

const DEFAULT_SYSTEM_PROMPT = `You are Lepus, an AI assistant running locally on the user's device.
Answer accurately and clearly. Never claim that you performed an action unless it was actually performed.
When information is incomplete or uncertain, state that explicitly.`

const PLATFORM_NAMES: Record<NodeJS.Platform, string> = {
  aix: 'AIX',
  android: 'Android',
  darwin: 'macOS',
  freebsd: 'FreeBSD',
  haiku: 'Haiku',
  linux: 'Linux',
  openbsd: 'OpenBSD',
  sunos: 'SunOS',
  win32: 'Windows',
  cygwin: 'Windows (Cygwin)',
  netbsd: 'NetBSD'
}

export type PromptBuildInput = {
  settings: PromptSettings
  locale: ChatLocale
  now?: Date
  timeZone?: string
  platform?: NodeJS.Platform
}

export class PromptBuilder {
  build(input: PromptBuildInput): string {
    const sections = [this.applicationInstructions(input.locale)]
    const customInstructions = input.settings.customInstructions.trim()
    if (customInstructions) {
      sections.push(`<user_instructions>\n${customInstructions}\n</user_instructions>`)
    }

    const runtimeContext = this.runtimeContext(input)
    if (runtimeContext) sections.push(runtimeContext)
    return sections.join('\n\n')
  }

  private applicationInstructions(locale: ChatLocale): string {
    const responseLanguage = locale === 'zh-CN' ? 'Simplified Chinese' : 'English'
    return `<application_instructions>\n${DEFAULT_SYSTEM_PROMPT}\nReply in ${responseLanguage} unless the user asks for another language.\n</application_instructions>`
  }

  private runtimeContext(input: PromptBuildInput): string {
    const entries: string[] = []
    const timeZone = input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
    const now = input.now ?? new Date()

    if (input.settings.includeCurrentTime) {
      entries.push(
        `current_time: ${this.formatTime(now, input.locale, timeZone, input.settings.includeTimezone)}`
      )
    }
    if (input.settings.includeTimezone) entries.push(`timezone: ${timeZone}`)
    if (input.settings.includeLocale) entries.push(`locale: ${input.locale}`)
    if (input.settings.includePlatform) {
      const platform = input.platform ?? process.platform
      entries.push(`platform: ${PLATFORM_NAMES[platform] ?? platform}`)
    }
    return entries.length ? `<runtime_context>\n${entries.join('\n')}\n</runtime_context>` : ''
  }

  private formatTime(
    now: Date,
    locale: ChatLocale,
    timeZone: string,
    includeTimeZone: boolean
  ): string {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      ...(includeTimeZone ? { timeZoneName: 'longOffset' as const } : {})
    }).format(now)
  }
}
