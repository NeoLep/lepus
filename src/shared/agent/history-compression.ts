export const HISTORY_COMPRESSION = {
  fallbackContextWindow: 16_384,
  softRatio: 0.6,
  hardRatio: 0.75,
  emergencyRatio: 0.9,
  minimumRecentMessages: 4,
  maximumRecentMessages: 10
} as const

export type ModelTokenSettings = {
  model: string
  contextWindowOverride: number | null
  detectedContextWindow: number | null
  maxOutputTokensOverride: number | null
  tokenEstimateRatio: number
}

export type CompressionPolicy = {
  contextWindow: number
  contextWindowSource: 'manual' | 'detected' | 'fallback'
  historyBudget: number
  softThresholdTokens: number
  hardThresholdTokens: number
  emergencyThresholdTokens: number
  recentTokenBudget: number
  summaryTokenTarget: number
  tokenEstimateRatio: number
}

const MODEL_CONTEXT_WINDOWS: Array<[RegExp, number]> = [
  [/^(gpt-4\.1|gpt-5)/i, 1_000_000],
  [/^(gpt-4o|gpt-4-turbo)/i, 128_000],
  [/^o[134](?:-|$)/i, 200_000],
  [/claude/i, 200_000],
  [/gemini-(?:1\.5|2|2\.5|3)/i, 1_000_000],
  [/deepseek/i, 64_000]
]

export function detectModelContextWindow(model: string): number | null {
  const normalizedModel = model.trim()
  return MODEL_CONTEXT_WINDOWS.find(([pattern]) => pattern.test(normalizedModel))?.[1] ?? null
}

export function createCompressionPolicy(settings: ModelTokenSettings): CompressionPolicy {
  const detected = settings.detectedContextWindow ?? detectModelContextWindow(settings.model)
  const contextWindow =
    settings.contextWindowOverride ?? detected ?? HISTORY_COMPRESSION.fallbackContextWindow
  const contextWindowSource = settings.contextWindowOverride
    ? 'manual'
    : detected
      ? 'detected'
      : 'fallback'
  const outputReserve =
    settings.maxOutputTokensOverride ?? Math.max(1_024, Math.floor(contextWindow * 0.15))
  const systemPromptReserve = Math.max(512, Math.floor(contextWindow * 0.05))
  const toolCallReserve = Math.max(512, Math.floor(contextWindow * 0.05))
  const historyBudget = Math.max(
    1_024,
    contextWindow -
      Math.min(outputReserve, Math.floor(contextWindow * 0.5)) -
      systemPromptReserve -
      toolCallReserve
  )
  const hardThresholdTokens = Math.floor(historyBudget * HISTORY_COMPRESSION.hardRatio)

  return {
    contextWindow,
    contextWindowSource,
    historyBudget,
    softThresholdTokens: Math.floor(historyBudget * HISTORY_COMPRESSION.softRatio),
    hardThresholdTokens,
    emergencyThresholdTokens: Math.floor(historyBudget * HISTORY_COMPRESSION.emergencyRatio),
    recentTokenBudget: Math.max(800, Math.min(8_000, Math.floor(hardThresholdTokens * 0.28))),
    summaryTokenTarget: Math.max(300, Math.min(1_200, Math.floor(hardThresholdTokens * 0.08))),
    tokenEstimateRatio: Math.min(2, Math.max(0.5, settings.tokenEstimateRatio || 1))
  }
}

export type TokenEstimatableMessage = {
  content: string
}

export function estimateTextTokens(text: string): number {
  let asciiCharacters = 0
  let nonAsciiCharacters = 0
  for (const character of text) {
    if (character.charCodeAt(0) <= 0x7f) asciiCharacters += 1
    else nonAsciiCharacters += 1
  }
  return Math.ceil(asciiCharacters / 4) + nonAsciiCharacters
}

export function estimateMessageTokens(messages: TokenEstimatableMessage[]): number {
  return messages.reduce((total, message) => total + estimateTextTokens(message.content) + 6, 0)
}

export function calibratedTokenEstimate(
  messages: TokenEstimatableMessage[],
  ratio: number
): number {
  return Math.ceil(estimateMessageTokens(messages) * ratio)
}
