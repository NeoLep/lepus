<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { ArrowUp, LoaderCircle, Pencil, RotateCcw, Sparkles, UserRound, X } from '@lucide/vue'
import type { Message, ToolCallRecord } from '@ipc/chat/constants'
import MarkdownContent from './MarkdownContent.vue'
import ToolCallCards from './ToolCallCards.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  messages: Message[]
  sending: boolean
  statusText?: string
  streamContent?: string
  activeToolCalls?: ToolCallRecord[]
  showToolCallDetails: boolean
}>()

const emit = defineEmits<{
  resend: [message: Message, content: string]
  regenerate: [message: Message]
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

async function startEditing(message: Message): Promise<void> {
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
  () => [props.messages.length, props.sending, props.statusText, props.streamContent],
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
          <strong>{{ message.role === 'user' ? t('you') : 'Lepus' }}</strong>
          <template v-if="message.role === 'user'">
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
              <p class="plain-content">{{ message.content }}</p>
              <div v-if="message.id === latestUserMessageId" class="message-actions">
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
            <ToolCallCards v-if="showToolCallDetails" :calls="message.toolCalls ?? []" />
            <MarkdownContent :content="message.content" :sources="message.sources" />
            <div v-if="message.id === latestAssistantMessageId" class="message-actions">
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

      <article v-if="sending" class="message assistant pending">
        <div class="message-avatar"><Sparkles :size="16" /></div>
        <div class="message-body">
          <strong>Lepus</strong>
          <ToolCallCards v-if="showToolCallDetails" :calls="activeToolCalls ?? []" />
          <MarkdownContent v-if="streamContent" :content="streamContent" />
          <span v-if="statusText" class="thinking"
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
  border: 1px solid #e4e7ec;
  border-radius: 14px;
  box-shadow: 0 4px 12px rgb(16 24 40 / 6%);
}

.welcome-state h1 {
  margin: 0;
  color: #1d2939;
  font-size: clamp(21px, 3vw, 27px);
  font-weight: 620;
  letter-spacing: -0.025em;
}

.welcome-state p {
  margin: 0;
  color: #98a2b3;
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
  border: 1px solid #e4e7ec;
  border-radius: 9px;
  background: #ffffff;
  color: #475467;
}

.message.assistant .message-avatar {
  border-color: #182230;
  background: #182230;
  color: #ffffff;
}

.message-body {
  min-width: 0;
  padding-top: 4px;
  flex: 1;
}

.message-body strong {
  display: block;
  margin-bottom: 6px;
  color: #344054;
  font-size: 12px;
  font-weight: 650;
}

.plain-content {
  margin: 0;
  color: #344054;
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
  color: #667085;
  font-size: 11px;
  cursor: pointer;
}

.message-actions button:hover,
.message-actions button:focus-visible {
  background: #f2f4f7;
  color: #344054;
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
  background: #ffffff;
  color: #182230;
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
  text-align: left;
}

.message-editor textarea:focus {
  border-color: #667085;
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
  border: 1px solid #d0d5dd;
  background: #ffffff;
  color: #475467;
}

.submit-edit-button {
  border: 1px solid #182230;
  background: #182230;
  color: #ffffff;
}

.submit-edit-button:disabled {
  border-color: #eaecf0;
  background: #eaecf0;
  color: #98a2b3;
  cursor: default;
}

.thinking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #98a2b3;
  font-size: 13px;
}

.thinking svg {
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
  editMessage: 编辑消息
  editAndResend: 编辑并重新发送
  regenerate: 重新生成
  send: 发送
en:
  welcomeTitle: How can I help?
  welcomeDescription: Send a message to start a new conversation.
  you: You
  thinking: Thinking
  editMessage: Edit message
  editAndResend: Edit and resend
  regenerate: Regenerate
  send: Send
</i18n>
