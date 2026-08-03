import type { PromptSettings } from '@/ipc/chat/constants'

export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  customInstructions: '',
  includeCurrentTime: true,
  includeTimezone: true,
  includeLocale: true,
  includePlatform: true
}

export const PROMPT_CUSTOM_INSTRUCTIONS_MAX_LENGTH = 6_000
