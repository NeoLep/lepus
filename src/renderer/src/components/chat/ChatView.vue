<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ChatComposer from './ChatComposer.vue'
import ChatMessageList from './ChatMessageList.vue'
import PermissionSettingsDialog from '../settings/PermissionSettingsDialog.vue'
import TaskPlanPanel from './TaskPlanPanel.vue'

import type {
  AgentRun,
  ChatLocale,
  CompressionRecord,
  CompressionStatus,
  Message,
  MessageAttachment,
  ModelConfig,
  TaskPlan,
  TaskModePreference,
  ToolApprovalRequest,
  ToolCallRecord,
  UserInputRequest
} from '@ipc/chat/constants'
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
  taskMode: TaskModePreference
  disabled: boolean
  disabledReason?: string
  ensureSession: (id: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  messageSent: [sessionId: string, content: string]
  taskModeChange: [preference: TaskModePreference]
}>()

const { t, locale } = useI18n({ useScope: 'local' })

const messagesBySession = ref<Record<string, Message[]>>({})
const loadedSessions = ref<Record<string, boolean>>({})
const loadingSessions = ref<Record<string, boolean>>({})
const statusModelBySession = ref<Record<string, string>>({})
const compressionStatusBySession = ref<Record<string, CompressionStatus>>({})
const compressionRecordsBySession = ref<Record<string, CompressionRecord[]>>({})
const compressingBySession = ref<Record<string, boolean>>({})
const streamedContentBySession = ref<Record<string, string>>({})
const toolActivitiesBySession = ref<Record<string, ToolCallRecord[]>>({})
const agentRunsBySession = ref<Record<string, AgentRun[]>>({})
const toolApprovalsBySession = ref<Record<string, ToolApprovalRequest[]>>({})
const taskPlansBySession = ref<Record<string, TaskPlan | null>>({})
const taskPlanLoadingBySession = ref<Record<string, boolean>>({})
const routedTaskModeBySession = ref<Record<string, boolean>>({})
const resolvingApprovalIds = ref<string[]>([])
const userInputRequestsBySession = ref<Record<string, UserInputRequest[]>>({})
const resolvingUserInputIds = ref<string[]>([])
const permissionSettingsOpen = ref(false)
const openingPermissionSettings = ref(false)
const showToolCallDetails = ref(true)
const compressionEventVersionBySession = ref<Record<string, number>>({})
const messages = computed(() =>
  props.sessionId ? (messagesBySession.value[props.sessionId] ?? []) : []
)
const draft = ref('')
const draftAttachmentsBySession = ref<Record<string, MessageAttachment[]>>({})
const addingAttachmentsBySession = ref<Record<string, boolean>>({})
const attachmentErrorBySession = ref<Record<string, string>>({})
const draftAttachments = computed(() =>
  props.sessionId ? (draftAttachmentsBySession.value[props.sessionId] ?? []) : []
)
const addingAttachments = computed(() =>
  props.sessionId ? (addingAttachmentsBySession.value[props.sessionId] ?? false) : false
)
const attachmentError = computed(() =>
  props.sessionId ? (attachmentErrorBySession.value[props.sessionId] ?? '') : ''
)
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
const compressionRecords = computed(() =>
  props.sessionId ? (compressionRecordsBySession.value[props.sessionId] ?? []) : []
)
const compressing = computed(() =>
  props.sessionId ? (compressingBySession.value[props.sessionId] ?? false) : false
)
const streamedContent = computed(() =>
  props.sessionId ? (streamedContentBySession.value[props.sessionId] ?? '') : ''
)
const activeToolCalls = computed(() =>
  props.sessionId ? (toolActivitiesBySession.value[props.sessionId] ?? []) : []
)
const agentRuns = computed(() =>
  props.sessionId ? (agentRunsBySession.value[props.sessionId] ?? []) : []
)
const activeToolApprovals = computed(() =>
  props.sessionId ? (toolApprovalsBySession.value[props.sessionId] ?? []) : []
)
const taskPlan = computed(() =>
  props.sessionId ? (taskPlansBySession.value[props.sessionId] ?? null) : null
)
const taskPlanLoading = computed(() =>
  props.sessionId ? (taskPlanLoadingBySession.value[props.sessionId] ?? false) : false
)
const taskModeActive = computed(() => {
  if (props.taskMode === 'on') return true
  if (props.taskMode === 'off' || !props.sessionId) return false
  return routedTaskModeBySession.value[props.sessionId] ?? false
})
const activeUserInputRequests = computed(() =>
  props.sessionId ? (userInputRequestsBySession.value[props.sessionId] ?? []) : []
)

let removeCompressionListener: (() => void) | null = null
let removeCompressionRecordListener: (() => void) | null = null
let removeStreamListener: (() => void) | null = null
let removeToolActivityListener: (() => void) | null = null
let removeAgentRunListener: (() => void) | null = null
let removeToolApprovalListener: (() => void) | null = null
let removeTaskPlanListener: (() => void) | null = null
let removeTaskModeRoutedListener: (() => void) | null = null
let removeUserInputListener: (() => void) | null = null

onMounted(() => {
  void refreshToolCallDetailSetting()
  removeCompressionListener = window.api.chat.onCompressionStatusChanged((event) => {
    compressionEventVersionBySession.value[event.sessionId] =
      (compressionEventVersionBySession.value[event.sessionId] ?? 0) + 1
    compressionStatusBySession.value[event.sessionId] = event.status
    compressingBySession.value[event.sessionId] = event.compressing
  })
  removeCompressionRecordListener = window.api.chat.onCompressionRecordChanged((event) => {
    const records = [...(compressionRecordsBySession.value[event.sessionId] ?? [])]
    const index = records.findIndex((record) => record.id === event.record.id)
    if (index === -1) records.push(event.record)
    else records[index] = event.record
    compressionRecordsBySession.value[event.sessionId] = records
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .slice(-50)
  })
  removeStreamListener = window.api.chat.onChatStreamDelta((event) => {
    streamedContentBySession.value[event.sessionId] = event.content
  })
  removeToolActivityListener = window.api.chat.onToolActivityChanged((event) => {
    const calls = [...(toolActivitiesBySession.value[event.sessionId] ?? [])]
    const index = calls.findIndex((call) => call.id === event.call.id)
    if (index === -1) calls.push(event.call)
    else calls[index] = event.call
    toolActivitiesBySession.value[event.sessionId] = calls
  })
  removeAgentRunListener = window.api.chat.onAgentRunChanged((event) => {
    const runs = [...(agentRunsBySession.value[event.sessionId] ?? [])]
    const index = runs.findIndex((run) => run.id === event.run.id)
    if (index === -1) runs.push(event.run)
    else runs[index] = event.run
    agentRunsBySession.value[event.sessionId] = runs
  })
  removeToolApprovalListener = window.api.chat.onToolApprovalRequested((event) => {
    const approvals = [...(toolApprovalsBySession.value[event.sessionId] ?? [])]
    const index = approvals.findIndex((approval) => approval.id === event.id)
    if (index === -1) approvals.push(event)
    else approvals[index] = event
    toolApprovalsBySession.value[event.sessionId] = approvals
  })
  removeTaskPlanListener = window.api.chat.onTaskPlanChanged((event) => {
    taskPlansBySession.value[event.sessionId] = event.plan
    taskPlanLoadingBySession.value[event.sessionId] = false
  })
  removeTaskModeRoutedListener = window.api.chat.onTaskModeRouted((event) => {
    routedTaskModeBySession.value[event.sessionId] = event.active
  })
  removeUserInputListener = window.api.chat.onUserInputRequested((request) => {
    const requests = [...(userInputRequestsBySession.value[request.sessionId] ?? [])]
    const index = requests.findIndex((item) => item.id === request.id)
    if (index === -1) requests.push(request)
    else requests[index] = request
    userInputRequestsBySession.value[request.sessionId] = requests
  })
})

async function refreshToolCallDetailSetting(): Promise<void> {
  try {
    const settings = await window.api.chat.queryPromptSettings()
    showToolCallDetails.value = settings.showToolCallDetails
  } catch (error) {
    console.error('Failed to load tool call detail setting', error)
  }
}

onUnmounted(() => {
  removeCompressionListener?.()
  removeCompressionRecordListener?.()
  removeStreamListener?.()
  removeToolActivityListener?.()
  removeAgentRunListener?.()
  removeToolApprovalListener?.()
  removeTaskPlanListener?.()
  removeTaskModeRoutedListener?.()
  removeUserInputListener?.()
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

function createLocalMessage(
  role: Message['role'],
  content: string,
  attachments: MessageAttachment[] = []
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(attachments.length ? { attachments } : {})
  }
}

function toIpcMessage(message: Message): Message {
  return {
    ...message,
    ...(message.toolCalls
      ? { toolCalls: message.toolCalls.map((toolCall) => ({ ...toolCall })) }
      : {}),
    ...(message.sources ? { sources: message.sources.map((source) => ({ ...source })) } : {}),
    ...(message.attachments
      ? { attachments: message.attachments.map((attachment) => ({ ...attachment })) }
      : {})
  }
}

async function sendMessage(): Promise<void> {
  const content = draft.value.trim()
  const attachments = draftAttachments.value.map((attachment) => ({ ...attachment }))
  const sessionId = props.sessionId
  const modelConfigId = props.modelConfig?.id ?? null
  if (
    (!content && !attachments.length) ||
    sending.value ||
    loading.value ||
    props.disabled ||
    !sessionId ||
    !modelConfigId
  )
    return

  sendingBySession.value[sessionId] = true
  streamedContentBySession.value[sessionId] = ''
  toolActivitiesBySession.value[sessionId] = []
  toolApprovalsBySession.value[sessionId] = []
  userInputRequestsBySession.value[sessionId] = []
  const sessionReady = await props.ensureSession(sessionId)
  if (!sessionReady) {
    sendingBySession.value[sessionId] = false
    return
  }

  if (!messagesBySession.value[sessionId]) messagesBySession.value[sessionId] = []
  const sessionMessages = messagesBySession.value[sessionId]
  const userMessage = createLocalMessage('user', content, attachments)
  sessionMessages.push(userMessage)
  draft.value = ''
  draftAttachmentsBySession.value[sessionId] = []

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

  emit(
    'messageSent',
    sessionId,
    content || t('attachmentOnlyTitle', { name: attachments[0]?.name ?? t('addAttachment') })
  )
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
  try {
    await window.api.chat.reviseMessage({
      sessionId,
      messageId: message.id,
      content: revisedContent
    })
    if (props.taskMode !== 'off') taskPlansBySession.value[sessionId] = null
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

async function regenerate(message: Message): Promise<void> {
  const sessionId = props.sessionId
  const modelConfigId = props.modelConfig?.id ?? null
  if (
    message.role !== 'assistant' ||
    sending.value ||
    loading.value ||
    !props.sessionPersisted ||
    !sessionId ||
    !modelConfigId
  ) {
    return
  }
  const sessionMessages = messagesBySession.value[sessionId] ?? []
  if (sessionMessages.at(-1)?.id !== message.id) return

  sendingBySession.value[sessionId] = true
  streamedContentBySession.value[sessionId] = ''
  try {
    await window.api.chat.regenerateMessage({ sessionId, messageId: message.id })
    if (props.taskMode !== 'off') taskPlansBySession.value[sessionId] = null
    sessionMessages.pop()
    compressionStatusBySession.value[sessionId] = await window.api.chat.queryCompressionStatus({
      sessionId,
      modelConfigId,
      locale: locale.value as ChatLocale
    })
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
      messages: sessionMessages.map(toIpcMessage)
    })

    if (response.message) sessionMessages.push(response.message)
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
    streamedContentBySession.value[sessionId] = ''
    toolActivitiesBySession.value[sessionId] = []
    toolApprovalsBySession.value[sessionId] = []
    userInputRequestsBySession.value[sessionId] = []
  }
}

async function stopGeneration(): Promise<void> {
  const sessionId = props.sessionId
  if (!sessionId || !sendingBySession.value[sessionId]) return
  await window.api.chat.cancelChat(sessionId)
}

async function cancelDownload(toolCallId: string): Promise<void> {
  if (!props.sessionId) return
  await window.api.chat.cancelTool({ sessionId: props.sessionId, toolCallId })
}

function appendAttachments(
  sessionId: string,
  attachments: MessageAttachment[],
  errors: Array<{ path: string; message: string }>
): void {
  const current = draftAttachmentsBySession.value[sessionId] ?? []
  const available = Math.max(0, 10 - current.length)
  draftAttachmentsBySession.value[sessionId] = [...current, ...attachments.slice(0, available)]
  const messages = errors.map((error) => `${error.path.split(/[\\/]/).pop()}: ${error.message}`)
  if (attachments.length > available) {
    messages.push(t('tooManyAttachments'))
    for (const attachment of attachments.slice(available)) {
      void window.api.chat
        .discardAttachment({ sessionId, attachment })
        .catch((error) => console.warn('Failed to discard excess attachment', error))
    }
  }
  attachmentErrorBySession.value[sessionId] = messages.join('；')
}

async function addAttachments(): Promise<void> {
  const sessionId = props.sessionId
  if (!sessionId || addingAttachments.value) return
  addingAttachmentsBySession.value[sessionId] = true
  attachmentErrorBySession.value[sessionId] = ''
  try {
    const result = await window.api.chat.selectAttachments(sessionId)
    if (props.sessionId === sessionId)
      appendAttachments(sessionId, result.attachments, result.errors)
  } catch (error) {
    attachmentErrorBySession.value[sessionId] =
      error instanceof Error ? error.message : t('attachmentAddFailed')
  } finally {
    addingAttachmentsBySession.value[sessionId] = false
  }
}

async function dropAttachments(files: File[]): Promise<void> {
  const sessionId = props.sessionId
  if (!sessionId || addingAttachments.value || !files.length) return
  addingAttachmentsBySession.value[sessionId] = true
  attachmentErrorBySession.value[sessionId] = ''
  try {
    const paths = files.map((file) => window.api.chat.getPathForFile(file)).filter(Boolean)
    const result = await window.api.chat.importAttachments({ sessionId, paths })
    if (props.sessionId === sessionId)
      appendAttachments(sessionId, result.attachments, result.errors)
  } catch (error) {
    attachmentErrorBySession.value[sessionId] =
      error instanceof Error ? error.message : t('attachmentAddFailed')
  } finally {
    addingAttachmentsBySession.value[sessionId] = false
  }
}

function removeAttachment(attachmentId: string): void {
  if (!props.sessionId) return
  const attachment = draftAttachments.value.find((item) => item.id === attachmentId)
  draftAttachmentsBySession.value[props.sessionId] = draftAttachments.value.filter(
    (attachment) => attachment.id !== attachmentId
  )
  attachmentErrorBySession.value[props.sessionId] = ''
  if (attachment) {
    void window.api.chat
      .discardAttachment({ sessionId: props.sessionId, attachment })
      .catch((error) => console.warn('Failed to discard attachment', error))
  }
}

async function openPermissionSettings(): Promise<void> {
  const sessionId = props.sessionId
  if (!sessionId || openingPermissionSettings.value) return
  openingPermissionSettings.value = true
  try {
    if (!(await props.ensureSession(sessionId))) return
    if (props.sessionId === sessionId) permissionSettingsOpen.value = true
  } finally {
    openingPermissionSettings.value = false
  }
}

async function resolveToolApproval(
  approval: ToolApprovalRequest,
  decision: 'allow_once' | 'allow_session' | 'reject'
): Promise<void> {
  if (resolvingApprovalIds.value.includes(approval.id)) return
  resolvingApprovalIds.value = [...resolvingApprovalIds.value, approval.id]
  try {
    await window.api.chat.resolveToolApproval({
      approvalId: approval.id,
      sessionId: approval.sessionId,
      decision
    })
    toolApprovalsBySession.value[approval.sessionId] = (
      toolApprovalsBySession.value[approval.sessionId] ?? []
    ).filter((item) => item.id !== approval.id)
  } catch (error) {
    console.error('Failed to resolve tool approval', error)
  } finally {
    resolvingApprovalIds.value = resolvingApprovalIds.value.filter((id) => id !== approval.id)
  }
}

async function answerUserInput(
  request: UserInputRequest,
  answer: string,
  selectedOptionId?: string
): Promise<void> {
  if (resolvingUserInputIds.value.includes(request.id)) return
  resolvingUserInputIds.value = [...resolvingUserInputIds.value, request.id]
  try {
    await window.api.chat.resolveUserInput({
      requestId: request.id,
      sessionId: request.sessionId,
      answer,
      ...(selectedOptionId ? { selectedOptionId } : {})
    })
    userInputRequestsBySession.value[request.sessionId] = (
      userInputRequestsBySession.value[request.sessionId] ?? []
    ).filter((item) => item.id !== request.id)
  } catch (error) {
    console.error('Failed to resolve user input', error)
  } finally {
    resolvingUserInputIds.value = resolvingUserInputIds.value.filter((id) => id !== request.id)
  }
}

watch(
  () => props.promptSettingsVersion,
  () => void refreshToolCallDetailSetting()
)

watch(
  () => props.sessionId,
  () => {
    draft.value = ''
  }
)

watch(
  () => [props.sessionId, props.sessionPersisted, props.taskMode] as const,
  async ([sessionId, sessionPersisted, taskMode]) => {
    if (!sessionId || taskMode === 'off') return
    if (!sessionPersisted) {
      taskPlansBySession.value[sessionId] = null
      taskPlanLoadingBySession.value[sessionId] = false
      return
    }
    taskPlanLoadingBySession.value[sessionId] = true
    try {
      taskPlansBySession.value[sessionId] = await window.api.chat.queryTaskPlan(sessionId)
    } catch (error) {
      console.error('Failed to load task plan', error)
    } finally {
      taskPlanLoadingBySession.value[sessionId] = false
    }
  },
  { immediate: true }
)

watch(
  () =>
    [
      props.sessionId,
      props.sessionPersisted,
      props.modelConfig?.id,
      props.modelConfig?.updatedAt,
      locale.value,
      props.promptSettingsVersion,
      props.taskMode
    ] as const,
  async ([
    sessionId,
    sessionPersisted,
    modelConfigId,
    modelConfigUpdatedAt,
    activeLocale,
    promptSettingsVersion,
    taskMode
  ]) => {
    if (!sessionId) return

    if (!sessionPersisted) {
      messagesBySession.value[sessionId] = []
      agentRunsBySession.value[sessionId] = []
      compressionRecordsBySession.value[sessionId] = []
      compressionStatusBySession.value[sessionId] = modelConfigId
        ? await window.api.chat.queryCompressionStatus({
            sessionId,
            modelConfigId,
            locale: activeLocale as ChatLocale
          })
        : emptyCompressionStatus()
      if (modelConfigId) {
        statusModelBySession.value[sessionId] =
          `${modelConfigId}:${modelConfigUpdatedAt ?? ''}:${activeLocale}:${promptSettingsVersion}:${taskMode}`
      }
      loadedSessions.value[sessionId] = true
      return
    }

    if (!modelConfigId) return
    const modelConfigKey = `${modelConfigId}:${modelConfigUpdatedAt ?? ''}:${activeLocale}:${promptSettingsVersion}:${taskMode}`

    if (loadedSessions.value[sessionId]) {
      if (!agentRunsBySession.value[sessionId]) {
        agentRunsBySession.value[sessionId] = await window.api.chat.queryAgentRuns(sessionId)
      }
      if (!compressionRecordsBySession.value[sessionId]) {
        compressionRecordsBySession.value[sessionId] =
          await window.api.chat.queryCompressionRecords(sessionId)
      }
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
      agentRunsBySession.value[sessionId] = await window.api.chat.queryAgentRuns(sessionId)
      compressionRecordsBySession.value[sessionId] =
        await window.api.chat.queryCompressionRecords(sessionId)
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
      v-if="sessionId"
      :session-id="sessionId"
      :messages="messages"
      :sending="sending || loading"
      :compressing="compressing"
      :compression-text="t('compressingContext')"
      :compression-records="compressionRecords"
      :stream-content="streamedContent"
      :active-tool-calls="activeToolCalls"
      :agent-runs="agentRuns"
      :approvals="activeToolApprovals"
      :resolving-approval-ids="resolvingApprovalIds"
      :user-input-requests="activeUserInputRequests"
      :resolving-user-input-ids="resolvingUserInputIds"
      :show-tool-call-details="showToolCallDetails"
      :status-text="loading ? t('loadingChat') : streamedContent ? undefined : t('thinking')"
      @resend="reviseAndResend"
      @regenerate="regenerate"
      @resolve-approval="resolveToolApproval"
      @answer-user-input="answerUserInput"
      @cancel-download="cancelDownload"
    />
    <TaskPlanPanel
      v-if="taskModeActive"
      :plan="taskPlan"
      :sending="sending"
      :loading="taskPlanLoading"
    />
    <ChatComposer
      v-if="sessionId"
      v-model="draft"
      :session-id="sessionId"
      :sending="sending"
      :disabled="disabled || loading"
      :placeholder="disabledReason"
      :compression-status="compressionStatus"
      :compressing="compressing"
      :attachments="draftAttachments"
      :adding-attachments="addingAttachments"
      :attachment-error="attachmentError"
      :task-mode="taskMode"
      @submit="sendMessage"
      @stop="stopGeneration"
      @permissions="openPermissionSettings"
      @add-attachments="addAttachments"
      @drop-attachments="dropAttachments"
      @remove-attachment="removeAttachment"
      @toggle-task-mode="(preference) => emit('taskModeChange', preference)"
    />
  </main>
  <PermissionSettingsDialog v-model:open="permissionSettingsOpen" :session-id="sessionId" />
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
  compressingContext: 正在压缩上下文
  thinking: 正在思考
  attachmentOnlyTitle: 附件：{name}
  addAttachment: 附件
  attachmentAddFailed: 添加附件失败
  tooManyAttachments: 每条消息最多添加 10 个附件
en:
  sendFailedWithReason: 'Failed to send: {reason}'
  sendFailed: Failed to send. Please try again later.
  loadingChat: Loading chat
  compressingHistory: Compressing chat history
  compressingContext: Compressing context
  thinking: Thinking
  attachmentOnlyTitle: 'Attachment: {name}'
  addAttachment: attachment
  attachmentAddFailed: Failed to add attachment
  tooManyAttachments: A message can contain at most 10 attachments
</i18n>
