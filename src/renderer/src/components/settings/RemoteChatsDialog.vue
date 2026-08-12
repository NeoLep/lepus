<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import { Bot, CalendarClock, LoaderCircle, MessageSquareText, X } from '@lucide/vue'
import type { Message, Session } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'
import ChatMessageList from '../chat/ChatMessageList.vue'

const props = withDefaults(
  defineProps<{
    sessions: Session[]
    variant?: 'remote' | 'scheduled'
    initialSessionId?: string | null
  }>(),
  { variant: 'remote', initialSessionId: null }
)

const open = defineModel<boolean>('open', { required: true })
const { t, locale } = useI18n({ useScope: 'local' })
const selectedSessionId = ref<string | null>(null)
const messages = ref<Message[]>([])
const loading = ref(false)
const error = ref('')
const showToolCallDetails = ref(true)
let loadVersion = 0

const selectedSession = computed(
  () => props.sessions.find((session) => session.id === selectedSessionId.value) ?? null
)

const remoteUserLabel = computed(() => {
  if (props.variant === 'scheduled') return t('taskInput')
  const title = displayTitle(selectedSession.value)
  return title.replace(/^来自\s*/, '') || t('remoteUser')
})

function displayTitle(session: Session | null): string {
  if (!session) return t('untitled')
  return props.variant === 'scheduled'
    ? session.title.replace(/^定时任务\s*·\s*/, '')
    : session.title.replace(/^飞书\s*·\s*/, '')
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

async function loadSession(sessionId: string): Promise<void> {
  const version = ++loadVersion
  selectedSessionId.value = sessionId
  loading.value = true
  error.value = ''
  try {
    const result = await window.api.chat.queryMessages(sessionId)
    if (version === loadVersion) messages.value = result
  } catch (cause) {
    if (version === loadVersion) {
      messages.value = []
      error.value = cause instanceof Error ? cause.message : t('loadFailed')
    }
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

async function initialize(): Promise<void> {
  try {
    showToolCallDetails.value = (await window.api.chat.queryPromptSettings()).showToolCallDetails
  } catch {
    showToolCallDetails.value = true
  }

  const session =
    props.sessions.find((item) => item.id === props.initialSessionId) ??
    props.sessions.find((item) => item.id === selectedSessionId.value) ??
    props.sessions[0]
  if (session) await loadSession(session.id)
  else {
    selectedSessionId.value = null
    messages.value = []
    error.value = ''
  }
}

watch(
  () => [
    open.value,
    props.initialSessionId,
    props.sessions.map((session) => `${session.id}:${session.updatedAt}`).join('|')
  ],
  ([isOpen]) => {
    if (isOpen) void initialize()
  },
  { immediate: true }
)
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="remote-chats-overlay" />
      <DialogContent class="remote-chats-dialog" @open-auto-focus.prevent>
        <header class="remote-chats-header">
          <span class="remote-chats-icon">
            <CalendarClock v-if="variant === 'scheduled'" :size="19" />
            <Bot v-else :size="19" />
          </span>
          <div>
            <DialogTitle class="remote-chats-title">
              {{ variant === 'scheduled' ? t('taskTitle') : t('title') }}
            </DialogTitle>
            <DialogDescription class="remote-chats-description">
              {{ variant === 'scheduled' ? t('taskDescription') : t('description') }}
            </DialogDescription>
          </div>
          <DialogClose class="remote-chats-close" :aria-label="t('common.close')">
            <X :size="18" />
          </DialogClose>
        </header>

        <div class="remote-chats-body">
          <aside class="remote-session-panel">
            <div class="remote-session-heading">
              <span>{{ t('conversations') }}</span>
              <small>{{ sessions.length }}</small>
            </div>
            <div v-if="sessions.length" class="remote-session-list">
              <button
                v-for="session in sessions"
                :key="session.id"
                class="remote-session-item"
                :class="{ active: session.id === selectedSessionId }"
                type="button"
                @click="loadSession(session.id)"
              >
                <MessageSquareText :size="15" />
                <span>
                  <strong>{{ displayTitle(session) }}</strong>
                  <small>{{ formatUpdatedAt(session.updatedAt) }}</small>
                </span>
              </button>
            </div>
            <div v-else class="remote-session-empty">
              {{ variant === 'scheduled' ? t('noTaskResults') : t('noConversations') }}
            </div>
          </aside>

          <section class="remote-conversation-panel">
            <header v-if="selectedSession" class="remote-conversation-header">
              <div>
                <strong>{{ displayTitle(selectedSession) }}</strong>
                <small>{{ variant === 'scheduled' ? t('scheduledRun') : t('fromFeishu') }}</small>
              </div>
              <time :datetime="selectedSession.updatedAt">
                {{ formatUpdatedAt(selectedSession.updatedAt) }}
              </time>
            </header>

            <div v-if="loading" class="remote-conversation-state">
              <LoaderCircle class="spin" :size="18" /> {{ t('common.loading') }}
            </div>
            <div v-else-if="error" class="remote-conversation-state error">{{ error }}</div>
            <ChatMessageList
              v-else-if="selectedSession && messages.length"
              :session-id="selectedSession.id"
              :messages="messages"
              :sending="false"
              :show-tool-call-details="showToolCallDetails"
              :user-label="remoteUserLabel"
              read-only
            />
            <div v-else class="remote-conversation-state empty">
              <MessageSquareText :size="24" />
              <strong>{{
                selectedSession
                  ? t('noMessages')
                  : variant === 'scheduled'
                    ? t('selectTaskResult')
                    : t('selectConversation')
              }}</strong>
              <small>{{
                selectedSession
                  ? t('noMessagesHint')
                  : variant === 'scheduled'
                    ? t('selectTaskResultHint')
                    : t('selectConversationHint')
              }}</small>
            </div>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.remote-chats-overlay {
  position: fixed;
  z-index: 140;
  inset: 0;
  background: var(--app-dialog-overlay);
}

.remote-chats-dialog {
  position: fixed;
  z-index: 141;
  top: 50%;
  left: 50%;
  display: grid;
  width: min(1080px, calc(100vw - 40px));
  height: min(760px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 16px;
  outline: none;
  background: var(--app-surface);
  box-shadow: 0 24px 70px rgb(16 24 40 / 28%);
  color: var(--app-text-secondary);
  transform: translate(-50%, -50%);
  grid-template-rows: auto minmax(0, 1fr);
}

.remote-chats-header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 17px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.remote-chats-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: rgb(51 112 255 / 12%);
  color: #3370ff;
}

.remote-chats-header > div {
  min-width: 0;
  flex: 1;
}

.remote-chats-title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 650;
}

.remote-chats-description {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.remote-chats-close {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
}

.remote-chats-close:hover {
  background: var(--app-hover);
  color: var(--app-text);
}

.remote-chats-body {
  display: grid;
  min-height: 0;
  overflow: hidden;
  grid-template-columns: 250px minmax(0, 1fr);
}

.remote-session-panel {
  display: grid;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--app-border-subtle);
  background: var(--app-surface-subtle);
  grid-template-rows: auto minmax(0, 1fr);
}

.remote-session-heading {
  display: flex;
  height: 42px;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 650;
}

.remote-session-heading small {
  min-width: 20px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--app-surface-muted);
  color: var(--app-text-muted);
  text-align: center;
}

.remote-session-list {
  min-height: 0;
  padding: 0 9px 12px;
  overflow-y: auto;
}

.remote-session-item {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 9px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--app-text-tertiary);
  text-align: left;
  cursor: pointer;
}

.remote-session-item:hover {
  background: var(--app-hover);
}

.remote-session-item.active {
  background: rgb(51 112 255 / 10%);
  color: #3370ff;
}

.remote-session-item > svg {
  margin-top: 2px;
  flex: 0 0 auto;
}

.remote-session-item > span {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 3px;
}

.remote-session-item strong,
.remote-session-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-session-item strong {
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.remote-session-item.active strong {
  color: #3370ff;
}

.remote-session-item small {
  color: var(--app-text-muted);
  font-size: 10px;
}

.remote-session-empty {
  padding: 28px 16px;
  color: var(--app-text-muted);
  font-size: 11px;
  text-align: center;
}

.remote-conversation-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.remote-conversation-header {
  display: flex;
  min-height: 58px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.remote-conversation-header > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.remote-conversation-header strong {
  overflow: hidden;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-conversation-header small,
.remote-conversation-header time {
  color: var(--app-text-muted);
  font-size: 10px;
}

.remote-conversation-header time {
  flex: 0 0 auto;
}

.remote-conversation-state {
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.remote-conversation-state.error {
  color: var(--app-danger);
}

.remote-conversation-state.empty {
  flex-direction: column;
  text-align: center;
}

.remote-conversation-state.empty strong {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.remote-conversation-state.empty small {
  color: var(--app-text-muted);
  font-size: 11px;
}

.spin {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .remote-chats-dialog {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
  }

  .remote-chats-body {
    grid-template-columns: 190px minmax(0, 1fr);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 飞书（远程对话）
  description: 查看通过飞书机器人产生的远程对话记录。
  taskTitle: 定时任务记录
  taskDescription: 查看定时任务每次执行生成的结果与工具调用。
  scheduledRun: 定时任务执行结果
  taskInput: 任务内容
  noTaskResults: 还没有定时任务执行记录
  selectTaskResult: 选择一条任务记录
  selectTaskResultHint: 从左侧列表查看任务内容、执行结果与工具调用。
  conversations: 对话列表
  fromFeishu: 来自飞书
  remoteUser: 飞书用户
  untitled: 未命名对话
  noConversations: 还没有飞书远程对话
  noMessages: 这段对话还没有消息
  noMessagesHint: 收到飞书消息后会显示在这里。
  selectConversation: 选择一段远程对话
  selectConversationHint: 从左侧列表查看消息内容。
  loadFailed: 无法加载远程对话消息
en:
  title: Feishu (Remote chats)
  description: View conversations created through the Feishu bot.
  taskTitle: Scheduled task history
  taskDescription: View the results and tool calls generated by scheduled task runs.
  scheduledRun: Scheduled task result
  taskInput: Task input
  noTaskResults: No scheduled task runs yet
  selectTaskResult: Select a task run
  selectTaskResultHint: Choose a run to view its input, result, and tool calls.
  conversations: Conversations
  fromFeishu: From Feishu
  remoteUser: Feishu user
  untitled: Untitled conversation
  noConversations: No Feishu conversations yet
  noMessages: This conversation has no messages
  noMessagesHint: Messages received from Feishu will appear here.
  selectConversation: Select a remote conversation
  selectConversationHint: Choose a conversation from the list to view its messages.
  loadFailed: Failed to load remote conversation
</i18n>
