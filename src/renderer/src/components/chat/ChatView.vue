<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ChatComposer from './ChatComposer.vue'
import ChatMessageList from './ChatMessageList.vue'

import type { ChatLocale, CompressionStatus, Message, ModelConfig } from '@ipc/chat/constants'
import {
  createCompressionPolicy,
  estimateMessageTokens,
  HISTORY_COMPRESSION
} from '@/shared/agent/history-compression'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  sessionId: string | null
  sessionPersisted: boolean
  modelConfig: ModelConfig | null
  promptSettingsVersion: number
  disabled: boolean
  disabledReason?: string
  ensureSession: (id: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  messageSent: [sessionId: string, content: string]
}>()

const { t, locale } = useI18n({ useScope: 'local' })

const messagesBySession = ref<Record<string, Message[]>>({})
const loadedSessions = ref<Record<string, boolean>>({})
const loadingSessions = ref<Record<string, boolean>>({})
const statusModelBySession = ref<Record<string, string>>({})
const compressionStatusBySession = ref<Record<string, CompressionStatus>>({})
const compressingBySession = ref<Record<string, boolean>>({})
const toolCallNamesBySession = ref<Record<string, string[]>>({})
const streamedContentBySession = ref<Record<string, string>>({})
const compressionEventVersionBySession = ref<Record<string, number>>({})
const messages = computed(() =>
  props.sessionId ? (messagesBySession.value[props.sessionId] ?? []) : []
)
const draft = ref('')
const sendingBySession = ref<Record<string, boolean>>({})
const sending = computed(() =>
  props.sessionId ? (sendingBySession.value[props.sessionId] ?? false) : false
)
const loading = computed(() =>
  props.sessionId ? (loadingSessions.value[props.sessionId] ?? false) : false
)
const compressionStatus = computed<CompressionStatus>(() =>
  props.sessionId
    ? (compressionStatusBySession.value[props.sessionId] ?? emptyCompressionStatus())
    : emptyCompressionStatus()
)
const compressing = computed(() =>
  props.sessionId ? (compressingBySession.value[props.sessionId] ?? false) : false
)
const toolCallStatusText = computed(() => {
  if (!props.sessionId) return ''
  const names = toolCallNamesBySession.value[props.sessionId] ?? []
  return names.length ? t('aboutToCallTools', { names: names.join(', ') }) : ''
})
const streamedContent = computed(() =>
  props.sessionId ? (streamedContentBySession.value[props.sessionId] ?? '') : ''
)

let removeCompressionListener: (() => void) | null = null
let removeToolCallListener: (() => void) | null = null
let removeStreamListener: (() => void) | null = null

onMounted(() => {
  removeCompressionListener = window.api.chat.onCompressionStatusChanged((event) => {
    compressionEventVersionBySession.value[event.sessionId] =
      (compressionEventVersionBySession.value[event.sessionId] ?? 0) + 1
    compressionStatusBySession.value[event.sessionId] = event.status
    compressingBySession.value[event.sessionId] = event.compressing
  })
  removeToolCallListener = window.api.chat.onToolCallStatusChanged((event) => {
    toolCallNamesBySession.value[event.sessionId] = event.toolNames
  })
  removeStreamListener = window.api.chat.onChatStreamDelta((event) => {
    streamedContentBySession.value[event.sessionId] = event.content
    toolCallNamesBySession.value[event.sessionId] = []
  })
})

onUnmounted(() => {
  removeCompressionListener?.()
  removeToolCallListener?.()
  removeStreamListener?.()
})

function emptyCompressionStatus(): CompressionStatus {
  const policy = createCompressionPolicy(
    props.modelConfig ?? {
      model: '',
      contextWindowOverride: null,
      detectedContextWindow: null,
      maxOutputTokensOverride: null,
      tokenEstimateRatio: 1
    }
  )
  return {
    estimatedTokens: 0,
    triggerTokens: policy.hardThresholdTokens,
    softThresholdTokens: policy.softThresholdTokens,
    emergencyThresholdTokens: policy.emergencyThresholdTokens,
    contextWindow: policy.contextWindow,
    contextWindowSource: policy.contextWindowSource,
    tokenEstimateRatio: policy.tokenEstimateRatio,
    usageRatio: 0,
    willCompress: false,
    uncompressedMessages: 0
  }
}

function createLocalMessage(role: Message['role'], content: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  }
}

async function sendMessage(): Promise<void> {
  const content = draft.value.trim()
  const sessionId = props.sessionId
  const modelConfigId = props.modelConfig?.id ?? null
  if (!content || sending.value || loading.value || props.disabled || !sessionId || !modelConfigId)
    return

  sendingBySession.value[sessionId] = true
  toolCallNamesBySession.value[sessionId] = []
  streamedContentBySession.value[sessionId] = ''
  const sessionReady = await props.ensureSession(sessionId)
  if (!sessionReady) {
    sendingBySession.value[sessionId] = false
    return
  }

  if (!messagesBySession.value[sessionId]) messagesBySession.value[sessionId] = []
  const sessionMessages = messagesBySession.value[sessionId]
  const userMessage = createLocalMessage('user', content)
  sessionMessages.push(userMessage)
  draft.value = ''

  const projectedTokens =
    compressionStatus.value.estimatedTokens +
    Math.ceil(estimateMessageTokens([userMessage]) * compressionStatus.value.tokenEstimateRatio)
  compressingBySession.value[sessionId] =
    compressionStatus.value.willCompress ||
    (projectedTokens >= compressionStatus.value.triggerTokens &&
      compressionStatus.value.uncompressedMessages + 1 > HISTORY_COMPRESSION.minimumRecentMessages)
  compressionStatusBySession.value[sessionId] = {
    ...compressionStatus.value,
    estimatedTokens: projectedTokens,
    usageRatio: projectedTokens / compressionStatus.value.triggerTokens,
    uncompressedMessages: compressionStatus.value.uncompressedMessages + 1
  }

  emit('messageSent', sessionId, content)
  await requestAssistant(sessionId, modelConfigId, sessionMessages)
}

async function reviseAndResend(message: Message, revisedContent: string): Promise<void> {
  const sessionId = props.sessionId
  const modelConfigId = props.modelConfig?.id ?? null
  if (
    message.role !== 'user' ||
    sending.value ||
    loading.value ||
    props.disabled ||
    !props.sessionPersisted ||
    !sessionId ||
    !modelConfigId
  ) {
    return
  }

  const sessionMessages = messagesBySession.value[sessionId] ?? []
  const messageIndex = sessionMessages.findIndex((item) => item.id === message.id)
  const hasLaterUserMessage = sessionMessages
    .slice(messageIndex + 1)
    .some((item) => item.role === 'user')
  if (messageIndex === -1 || hasLaterUserMessage) return

  sendingBySession.value[sessionId] = true
  streamedContentBySession.value[sessionId] = ''
  toolCallNamesBySession.value[sessionId] = []
  try {
    await window.api.chat.reviseMessage({
      sessionId,
      messageId: message.id,
      content: revisedContent
    })
    sessionMessages[messageIndex] = { ...message, content: revisedContent.trim() }
    sessionMessages.splice(messageIndex + 1)
    compressionStatusBySession.value[sessionId] = await window.api.chat.queryCompressionStatus({
      sessionId,
      modelConfigId,
      locale: locale.value as ChatLocale
    })
    compressingBySession.value[sessionId] = compressionStatusBySession.value[sessionId].willCompress
  } catch (error) {
    sessionMessages.push(createSendErrorMessage(error))
    sendingBySession.value[sessionId] = false
    return
  }

  await requestAssistant(sessionId, modelConfigId, sessionMessages)
}

function createSendErrorMessage(error: unknown): Message {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content:
      error instanceof Error
        ? t('sendFailedWithReason', { reason: error.message })
        : t('sendFailed'),
    createdAt: new Date().toISOString()
  }
}

async function requestAssistant(
  sessionId: string,
  modelConfigId: string,
  sessionMessages: Message[]
): Promise<void> {
  const compressionEventVersion = compressionEventVersionBySession.value[sessionId] ?? 0

  try {
    const response = await window.api.chat.sendChatMessage({
      conversationId: sessionId,
      modelConfigId,
      locale: locale.value as ChatLocale,
      messages: sessionMessages.map((message) => ({ ...message }))
    })

    sessionMessages.push(response.message)
    if ((compressionEventVersionBySession.value[sessionId] ?? 0) === compressionEventVersion) {
      compressionStatusBySession.value[sessionId] = response.compression
    }
  } catch (error) {
    sessionMessages.push(createSendErrorMessage(error))
    try {
      compressionStatusBySession.value[sessionId] = await window.api.chat.queryCompressionStatus({
        sessionId,
        modelConfigId,
        locale: locale.value as ChatLocale
      })
    } catch (statusError) {
      console.error('Failed to refresh compression status', statusError)
    }
  } finally {
    const latestStatus = compressionStatusBySession.value[sessionId]
    const backgroundCompressionExpected =
      latestStatus &&
      latestStatus.estimatedTokens >= latestStatus.softThresholdTokens &&
      latestStatus.uncompressedMessages > HISTORY_COMPRESSION.minimumRecentMessages
    if (!backgroundCompressionExpected) compressingBySession.value[sessionId] = false
    sendingBySession.value[sessionId] = false
    toolCallNamesBySession.value[sessionId] = []
    streamedContentBySession.value[sessionId] = ''
  }
}

watch(
  () => props.sessionId,
  () => {
    draft.value = ''
  }
)

watch(
  () =>
    [
      props.sessionId,
      props.sessionPersisted,
      props.modelConfig?.id,
      props.modelConfig?.updatedAt,
      locale.value,
      props.promptSettingsVersion
    ] as const,
  async ([
    sessionId,
    sessionPersisted,
    modelConfigId,
    modelConfigUpdatedAt,
    activeLocale,
    promptSettingsVersion
  ]) => {
    if (!sessionId) return

    if (!sessionPersisted) {
      messagesBySession.value[sessionId] = []
      compressionStatusBySession.value[sessionId] = modelConfigId
        ? await window.api.chat.queryCompressionStatus({
            sessionId,
            modelConfigId,
            locale: activeLocale as ChatLocale
          })
        : emptyCompressionStatus()
      if (modelConfigId) {
        statusModelBySession.value[sessionId] =
          `${modelConfigId}:${modelConfigUpdatedAt ?? ''}:${activeLocale}:${promptSettingsVersion}`
      }
      loadedSessions.value[sessionId] = true
      return
    }

    if (!modelConfigId) return
    const modelConfigKey = `${modelConfigId}:${modelConfigUpdatedAt ?? ''}:${activeLocale}:${promptSettingsVersion}`

    if (loadedSessions.value[sessionId]) {
      if (statusModelBySession.value[sessionId] !== modelConfigKey) {
        compressionStatusBySession.value[sessionId] = await window.api.chat.queryCompressionStatus({
          sessionId,
          modelConfigId,
          locale: activeLocale as ChatLocale
        })
        statusModelBySession.value[sessionId] = modelConfigKey
      }
      return
    }

    loadingSessions.value[sessionId] = true
    try {
      messagesBySession.value[sessionId] = await window.api.chat.queryMessages(sessionId)
      compressionStatusBySession.value[sessionId] = await window.api.chat.queryCompressionStatus({
        sessionId,
        modelConfigId,
        locale: activeLocale as ChatLocale
      })
      statusModelBySession.value[sessionId] = modelConfigKey
      loadedSessions.value[sessionId] = true
    } catch (error) {
      console.error('Failed to load messages', error)
    } finally {
      loadingSessions.value[sessionId] = false
    }
  },
  { immediate: true }
)
</script>

<template>
  <main class="chat-view">
    <ChatMessageList
      :messages="messages"
      :sending="sending || loading"
      :stream-content="streamedContent"
      :status-text="
        loading
          ? t('loadingChat')
          : toolCallStatusText
            ? toolCallStatusText
            : streamedContent
              ? undefined
              : compressing
                ? t('compressingHistory')
                : t('thinking')
      "
      @resend="reviseAndResend"
    />
    <ChatComposer
      v-model="draft"
      :sending="sending"
      :disabled="disabled || loading"
      :placeholder="disabledReason"
      :compression-status="compressionStatus"
      :compressing="compressing"
      @submit="sendMessage"
    />
  </main>
</template>

<style scoped>
.chat-view {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: #ffffff;
}
</style>

<i18n lang="yaml">
zh-CN:
  sendFailedWithReason: 发送失败：{reason}
  sendFailed: 发送失败，请稍后重试。
  loadingChat: 正在加载对话
  compressingHistory: 正在压缩历史对话
  thinking: 正在思考
  aboutToCallTools: 即将调用 {names}
en:
  sendFailedWithReason: 'Failed to send: {reason}'
  sendFailed: Failed to send. Please try again later.
  loadingChat: Loading chat
  compressingHistory: Compressing chat history
  thinking: Thinking
  aboutToCallTools: About to call {names}
</i18n>
