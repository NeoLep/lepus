<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { ArrowUp, LoaderCircle, Pencil, RotateCcw, Sparkles, UserRound, X } from '@lucide/vue'
import type {
  AgentRun,
  CompressionRecord,
  Message,
  SkillSummary,
  ToolApprovalRequest,
  ToolCallRecord,
  UserInputRequest
} from '@ipc/chat/constants'
import MarkdownContent from './MarkdownContent.vue'
import GeneratedFileLinks from './GeneratedFileLinks.vue'
import FileDiffCards from './FileDiffCards.vue'
import ToolApprovalCards from './ToolApprovalCards.vue'
import ToolCallCards from './ToolCallCards.vue'
import DownloadCards from './DownloadCards.vue'
import FileInspectionCards from './FileInspectionCards.vue'
import MessageAttachments from './MessageAttachments.vue'
import UserInputCards from './UserInputCards.vue'
import CompressionRecordDividers from './CompressionRecordDividers.vue'
import SubAgentRunCards from './SubAgentRunCards.vue'
import BrowserToolCards from './BrowserToolCards.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  sessionId: string
  messages: Message[]
  sending: boolean
  compressing?: boolean
  compressionText?: string
  compressionRecords?: CompressionRecord[]
  statusText?: string
  streamContent?: string
  activeToolCalls?: ToolCallRecord[]
  agentRuns?: AgentRun[]
  activeSkills?: SkillSummary[]
  approvals?: ToolApprovalRequest[]
  resolvingApprovalIds?: string[]
  userInputRequests?: UserInputRequest[]
  resolvingUserInputIds?: string[]
  showToolCallDetails: boolean
  readOnly?: boolean
  userLabel?: string
}>()

const emit = defineEmits<{
  resend: [message: Message, content: string]
  regenerate: [message: Message]
  cancelDownload: [toolCallId: string]
  resolveApproval: [
    approval: ToolApprovalRequest,
    decision: 'allow_once' | 'allow_session' | 'reject'
  ]
  answerUserInput: [request: UserInputRequest, answer: string, selectedOptionId?: string]
}>()

const messageEnd = ref<HTMLElement | null>(null)
const editingMessageId = ref<string | null>(null)
const editDraft = ref('')
const { t } = useI18n({ useScope: 'local' })
const latestUserMessageId = computed(
  () => [...props.messages].reverse().find((message) => message.role === 'user')?.id ?? null
)
const latestAssistantMessageId = computed(() =>
  props.messages.at(-1)?.role === 'assistant' ? props.messages.at(-1)?.id : null
)
const activeSubAgentRuns = computed(() => {
  const primaryRun = [...(props.agentRuns ?? [])]
    .filter(
      (run) =>
        run.kind === 'primary' &&
        !run.responseMessageId &&
        !['completed', 'failed', 'canceled'].includes(run.status)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return primaryRun ? subAgentRunsForParent(primaryRun.id) : []
})

function subAgentRunsForParent(parentRunId: string): AgentRun[] {
  return (props.agentRuns ?? [])
    .filter((run) => run.kind === 'subtask' && run.parentRunId === parentRunId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function subAgentRunsForMessage(messageId: string): AgentRun[] {
  const parentRun = (props.agentRuns ?? []).find(
    (run) => run.kind === 'primary' && run.responseMessageId === messageId
  )
  return parentRun ? subAgentRunsForParent(parentRun.id) : []
}

function visibleToolCalls(calls: ToolCallRecord[] | undefined): ToolCallRecord[] {
  return (calls ?? []).filter(
    (call) => call.name !== 'delegate_tasks' && !call.name.startsWith('browser_')
  )
}

async function startEditing(message: Message): Promise<void> {
  if (props.readOnly) return
  editingMessageId.value = message.id
  editDraft.value = message.content
  await nextTick()
  const textarea = document.querySelector<HTMLTextAreaElement>('.message-editor textarea')
  textarea?.focus()
  textarea?.setSelectionRange(editDraft.value.length, editDraft.value.length)
}

function cancelEditing(): void {
  editingMessageId.value = null
  editDraft.value = ''
}

function submitEditing(message: Message): void {
  const content = editDraft.value.trim()
  if (!content || props.sending) return
  emit('resend', message, content)
  cancelEditing()
}

watch(
  () => [
    props.messages.length,
    props.sending,
    props.statusText,
    props.streamContent,
    props.approvals?.length,
    props.userInputRequests?.length,
    props.compressing,
    props.agentRuns?.map((run) => `${run.id}:${run.status}`).join('|')
  ],
  async () => {
    await nextTick()
    messageEnd.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }
)
</script>

<template>
  <div class="message-scroll">
    <div v-if="messages.length === 0" class="welcome-state">
      <div class="welcome-mark"><Sparkles :size="22" /></div>
      <h1>{{ t('welcomeTitle') }}</h1>
      <p>{{ t('welcomeDescription') }}</p>
    </div>

    <div v-else class="message-list" aria-live="polite">
      <article v-for="message in messages" :key="message.id" class="message" :class="message.role">
        <div class="message-avatar">
          <UserRound v-if="message.role === 'user'" :size="16" />
          <Sparkles v-else :size="16" />
        </div>
        <div class="message-body">
          <strong>{{ message.role === 'user' ? (userLabel ?? t('you')) : 'Lepus' }}</strong>
          <template v-if="message.role === 'user'">
            <MessageAttachments
              v-if="message.attachments?.length"
              :session-id="sessionId"
              :attachments="message.attachments"
            />
            <div v-if="editingMessageId === message.id" class="message-editor">
              <textarea
                v-model="editDraft"
                rows="3"
                :aria-label="t('editMessage')"
                @keydown.meta.enter.prevent="submitEditing(message)"
                @keydown.ctrl.enter.prevent="submitEditing(message)"
                @keydown.esc.prevent="cancelEditing"
              ></textarea>
              <div class="editor-actions">
                <button class="cancel-edit-button" type="button" @click="cancelEditing">
                  <X :size="14" />
                  {{ t('common.cancel') }}
                </button>
                <button
                  class="submit-edit-button"
                  type="button"
                  :disabled="!editDraft.trim() || sending"
                  @click="submitEditing(message)"
                >
                  <ArrowUp :size="14" />
                  {{ t('send') }}
                </button>
              </div>
            </div>
            <template v-else>
              <p v-if="message.content" class="plain-content">{{ message.content }}</p>
              <div v-if="!readOnly && message.id === latestUserMessageId" class="message-actions">
                <button
                  type="button"
                  :disabled="sending"
                  :aria-label="t('editAndResend')"
                  @click="startEditing(message)"
                >
                  <Pencil :size="13" />
                  {{ t('editAndResend') }}
                </button>
              </div>
            </template>
          </template>
          <template v-else>
            <SubAgentRunCards :runs="subAgentRunsForMessage(message.id)" />
            <BrowserToolCards :calls="message.toolCalls ?? []" :session-id="sessionId" />
            <ToolCallCards
              v-if="showToolCallDetails"
              :calls="visibleToolCalls(message.toolCalls)"
            />
            <GeneratedFileLinks :calls="message.toolCalls ?? []" />
            <DownloadCards :calls="message.toolCalls ?? []" />
            <FileInspectionCards :calls="message.toolCalls ?? []" />
            <FileDiffCards :calls="message.toolCalls ?? []" />
            <MarkdownContent :content="message.content" :sources="message.sources" />
            <div
              v-if="!readOnly && message.id === latestAssistantMessageId"
              class="message-actions"
            >
              <button
                type="button"
                :disabled="sending"
                :aria-label="t('regenerate')"
                @click="emit('regenerate', message)"
              >
                <RotateCcw :size="13" />
                {{ t('regenerate') }}
              </button>
            </div>
          </template>
        </div>
      </article>

      <CompressionRecordDividers :records="compressionRecords ?? []" />
      <div
        v-if="compressing && !compressionRecords?.some((record) => record.status === 'running')"
        class="compression-divider"
        role="status"
        aria-live="polite"
      >
        <span></span>
        <strong><LoaderCircle :size="14" /> {{ compressionText ?? t('compressing') }}</strong>
        <span></span>
      </div>

      <article v-if="sending" class="message assistant pending">
        <div class="message-avatar"><Sparkles :size="16" /></div>
        <div class="message-body">
          <strong>Lepus</strong>
          <div v-if="activeSkills?.length" class="active-skills" role="status">
            <Sparkles :size="14" />
            <span>{{ t('activeSkills') }}</span>
            <strong v-for="skill in activeSkills" :key="skill.id" :title="skill.description">
              {{ skill.name }}
            </strong>
          </div>
          <SubAgentRunCards :runs="activeSubAgentRuns" />
          <BrowserToolCards
            :calls="activeToolCalls ?? []"
            :session-id="sessionId"
            active
            @cancel="(toolCallId) => emit('cancelDownload', toolCallId)"
          />
          <ToolCallCards
            v-if="showToolCallDetails"
            :calls="visibleToolCalls(activeToolCalls)"
            active
            @cancel="(toolCallId) => emit('cancelDownload', toolCallId)"
          />
          <GeneratedFileLinks :calls="activeToolCalls ?? []" />
          <DownloadCards
            :calls="activeToolCalls ?? []"
            active
            @cancel="(toolCallId) => emit('cancelDownload', toolCallId)"
          />
          <FileInspectionCards :calls="activeToolCalls ?? []" />
          <FileDiffCards :calls="activeToolCalls ?? []" />
          <ToolApprovalCards
            :approvals="approvals ?? []"
            :resolving-ids="resolvingApprovalIds"
            @resolve="(approval, decision) => emit('resolveApproval', approval, decision)"
          />
          <UserInputCards
            :requests="userInputRequests ?? []"
            :resolving-ids="resolvingUserInputIds ?? []"
            @answer="
              (request, answer, selectedOptionId) =>
                emit('answerUserInput', request, answer, selectedOptionId)
            "
          />
          <MarkdownContent v-if="streamContent" :content="streamContent" />
          <span
            v-if="statusText && !approvals?.length && !userInputRequests?.length"
            class="thinking"
            ><LoaderCircle :size="15" /> {{ statusText ?? t('thinking') }}</span
          >
        </div>
      </article>
      <div ref="messageEnd" class="message-end"></div>
    </div>
  </div>
</template>

<style scoped>
.message-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.welcome-state {
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  padding: 48px 24px 24px;
  text-align: center;
}

.welcome-mark {
  display: grid;
  width: 46px;
  height: 46px;
  margin-bottom: 4px;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  box-shadow: 0 4px 12px rgb(16 24 40 / 6%);
}

.welcome-state h1 {
  margin: 0;
  color: var(--app-text);
  font-size: clamp(21px, 3vw, 27px);
  font-weight: 620;
  letter-spacing: -0.025em;
}

.welcome-state p {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 13px;
}

.message-list {
  width: min(760px, calc(100% - 40px));
  margin: 0 auto;
  padding: 34px 0 18px;
}

.message {
  display: flex;
  gap: 12px;
  padding: 14px 4px;
  &.user {
    flex-direction: row-reverse;
    .message-body {
      text-align: right;
    }
  }
}

.message + .message {
  /* border-top: 1px solid #f0f2f5; */
}

.message-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  background: var(--app-surface);
  color: var(--app-text-tertiary);
}

.message.assistant .message-avatar {
  border-color: var(--app-text);
  background: var(--app-inverse-bg);
  color: var(--app-agent-card-bg);
}

.message-body {
  min-width: 0;
  padding-top: 4px;
  flex: 1;
}

.message-body strong {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.plain-content {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.message-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.message-actions button {
  display: inline-flex;
  height: 26px;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 11px;
  cursor: pointer;
}

.message-actions button:hover,
.message-actions button:focus-visible {
  background: var(--app-surface-muted);
  color: var(--app-text-secondary);
}

.message-actions button:disabled {
  opacity: 0.45;
  cursor: default;
}

.message-editor {
  width: min(560px, 100%);
  margin-left: auto;
}

.message-editor textarea {
  display: block;
  width: 100%;
  min-height: 88px;
  padding: 10px 11px;
  resize: vertical;
  border: 1px solid #98a2b3;
  border-radius: 10px;
  outline: none;
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
  text-align: left;
}

.message-editor textarea:focus {
  border-color: var(--app-text-tertiary);
  box-shadow: 0 0 0 3px rgb(152 162 179 / 16%);
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 8px;
}

.editor-actions button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.cancel-edit-button {
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-tertiary);
}

.submit-edit-button {
  border: 1px solid var(--app-inverse-bg);
  background: var(--app-inverse-bg);
  color: var(--app-agent-card-bg);
}

.submit-edit-button:disabled {
  border-color: var(--app-border-subtle);
  background: var(--app-border-subtle);
  color: var(--app-text-muted);
  cursor: default;
}

.thinking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-muted);
  font-size: 13px;
}

.thinking svg {
  animation: spin 900ms linear infinite;
}

.active-skills {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  margin: 4px 0 9px;
  padding: 6px 8px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-size: 10px;
}

.active-skills > strong {
  margin: 0;
  color: var(--app-accent);
  font-family: ui-monospace, monospace;
  font-size: 10px;
}

.compression-divider {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  margin: 4px 0 14px;
  color: var(--app-text-muted);
}

.compression-divider > span {
  height: 1px;
  background: var(--app-border-subtle);
}

.compression-divider strong {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 550;
}

.compression-divider svg {
  animation: spin 900ms linear infinite;
}

.message-end {
  height: 1px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  welcomeTitle: 有什么可以帮忙的？
  welcomeDescription: 试着发送一条消息，开始新的对话。
  you: 你
  thinking: 正在思考
  compressing: 正在压缩上下文
  editMessage: 编辑消息
  editAndResend: 编辑并重新发送
  regenerate: 重新生成
  send: 发送
  activeSkills: 已启用 Skill
en:
  welcomeTitle: How can I help?
  welcomeDescription: Send a message to start a new conversation.
  you: You
  thinking: Thinking
  compressing: Compressing context
  editMessage: Edit message
  editAndResend: Edit and resend
  regenerate: Regenerate
  send: Send
  activeSkills: Active Skills
</i18n>
