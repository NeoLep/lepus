<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowUp, FolderCog, ListTodo, LoaderCircle, Paperclip, Square } from '@lucide/vue'
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'
import type { CompressionStatus, MessageAttachment, TaskModePreference } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'
import MessageAttachments from './MessageAttachments.vue'

const props = defineProps<{
  sessionId: string
  sending: boolean
  disabled: boolean
  placeholder?: string
  compressionStatus: CompressionStatus
  compressing: boolean
  attachments: MessageAttachment[]
  addingAttachments: boolean
  attachmentError?: string
  taskMode: TaskModePreference
}>()

const emit = defineEmits<{
  submit: []
  stop: []
  permissions: []
  addAttachments: []
  dropAttachments: [files: File[]]
  removeAttachment: [attachmentId: string]
  toggleTaskMode: []
}>()

const { t, locale } = useI18n({ useScope: 'local' })
const formatNumber = (value: number): string => new Intl.NumberFormat(locale.value).format(value)

const model = defineModel<string>({ required: true })
const textarea = ref<HTMLTextAreaElement | null>(null)
const draggingFiles = ref(false)
const ringProgress = computed(() => Math.min(Math.max(props.compressionStatus.usageRatio, 0), 1))
const ringOffset = computed(() => 100 - ringProgress.value * 100)
const tokenLabel = computed(() => {
  const current = formatNumber(props.compressionStatus.estimatedTokens)
  const trigger = formatNumber(props.compressionStatus.triggerTokens)
  return t('tokenUsage', { current, trigger })
})
const remainingTokens = computed(() =>
  formatNumber(
    Math.max(0, props.compressionStatus.triggerTokens - props.compressionStatus.estimatedTokens)
  )
)
const contextSourceLabel = computed(() => {
  return t(`contextSource.${props.compressionStatus.contextWindowSource}`)
})

function resizeTextarea(): void {
  const element = textarea.value
  if (!element) return

  element.style.height = '0'
  element.style.height = `${Math.min(element.scrollHeight, 160)}px`
}

function submit(): void {
  if ((!model.value.trim() && !props.attachments.length) || props.sending || props.disabled) return
  emit('submit')
}

function handleDrop(event: DragEvent): void {
  draggingFiles.value = false
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length) emit('dropAttachments', files)
}

function handlePrimaryAction(): void {
  if (props.sending) emit('stop')
  else submit()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  submit()
}

watch(model, async () => {
  await nextTick()
  resizeTextarea()
})
</script>

<template>
  <div class="composer-wrap">
    <form
      class="composer"
      :class="{ 'dragging-files': draggingFiles }"
      @submit.prevent="submit"
      @dragenter.prevent="draggingFiles = true"
      @dragover.prevent="draggingFiles = true"
      @dragleave.prevent="draggingFiles = false"
      @drop.prevent="handleDrop"
    >
      <div v-if="draggingFiles" class="drop-overlay">{{ t('dropAttachments') }}</div>
      <MessageAttachments
        v-if="attachments.length"
        :session-id="sessionId"
        :attachments="attachments"
        compact
        removable
        @remove="(id) => emit('removeAttachment', id)"
      />
      <textarea
        ref="textarea"
        v-model="model"
        rows="1"
        :placeholder="disabled ? (placeholder ?? t('loadingChat')) : t('messagePlaceholder')"
        :aria-label="t('chatMessage')"
        :disabled="disabled"
        @keydown="handleKeydown"
      ></textarea>

      <div class="composer-actions">
        <button
          class="composer-icon"
          type="button"
          :aria-label="t('addAttachment')"
          :disabled="disabled || sending || addingAttachments"
          @click="emit('addAttachments')"
        >
          <LoaderCircle v-if="addingAttachments" class="spin" :size="18" />
          <Paperclip v-else :size="18" />
        </button>
        <TooltipRoot>
          <TooltipTrigger as-child>
            <button
              class="composer-icon"
              type="button"
              :aria-label="t('filePermissions')"
              @click="emit('permissions')"
            >
              <FolderCog :size="18" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent class="tooltip-content" side="top" :side-offset="7">
              {{ t('filePermissions') }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
        <TooltipRoot>
          <TooltipTrigger as-child>
            <button
              class="composer-icon"
              :class="{ active: taskMode === 'on', auto: taskMode === 'auto' }"
              type="button"
              :disabled="disabled || sending"
              :aria-label="t(`taskMode.${taskMode}`)"
              :aria-pressed="taskMode === 'on'"
              @click="emit('toggleTaskMode')"
            >
              <ListTodo :size="18" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent class="tooltip-content" side="top" :side-offset="7">
              {{ t(`taskMode.${taskMode}`) }} · {{ t('taskMode.clickHint') }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
        <span class="composer-hint">{{ t('keyboardHint') }}</span>
        <TooltipRoot>
          <TooltipTrigger as-child>
            <div
              class="token-meter"
              :class="{
                warning: compressionStatus.estimatedTokens >= compressionStatus.softThresholdTokens,
                full: ringProgress >= 1,
                emergency:
                  compressionStatus.estimatedTokens >= compressionStatus.emergencyThresholdTokens,
                compressing
              }"
              role="progressbar"
              tabindex="0"
              :aria-label="t('historyTokenUsage')"
              :aria-valuetext="compressing ? t('compressingHistory') : tokenLabel"
              :aria-valuenow="Math.round(ringProgress * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <svg class="token-ring" viewBox="0 0 36 36" aria-hidden="true">
                <circle class="token-ring-track" cx="18" cy="18" r="14" pathLength="100" />
                <circle
                  class="token-ring-progress"
                  cx="18"
                  cy="18"
                  r="14"
                  pathLength="100"
                  stroke-dasharray="100"
                  :stroke-dashoffset="ringOffset"
                />
              </svg>
              <span v-if="compressing" class="compression-label">{{ t('compressing') }}</span>
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent class="tooltip-content" side="top" :side-offset="7">
              <template v-if="compressing">{{ t('compressingHistory') }}</template>
              <template v-else>
                <strong>{{ tokenLabel }}</strong>
                <span>{{ t('remainingBeforeCompression', { count: remainingTokens }) }}</span>
                <span>
                  {{
                    t('modelContext', {
                      source: contextSourceLabel,
                      count: formatNumber(compressionStatus.contextWindow)
                    })
                  }}
                </span>
              </template>
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
        <button
          class="send-button"
          type="button"
          :class="{ sending }"
          :disabled="sending ? false : (!model.trim() && !attachments.length) || disabled"
          :aria-label="sending ? t('stopGenerating') : t('sendMessage')"
          @click="handlePrimaryAction"
        >
          <Square v-if="sending" :size="14" fill="currentColor" />
          <ArrowUp v-else :size="18" :stroke-width="2.4" />
        </button>
      </div>
    </form>
    <p v-if="attachmentError" class="attachment-error">{{ attachmentError }}</p>
    <p class="disclaimer">{{ t('disclaimer') }}</p>
  </div>
</template>

<style scoped>
.composer-wrap {
  width: min(760px, calc(100% - 32px));
  margin: 0 auto;
  padding: 12px 0 10px;
}

.composer {
  position: relative;
  padding: 13px 14px 10px;
  border: 1px solid #dfe3e8;
  border-radius: 20px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgb(16 24 40 / 4%),
    0 8px 24px rgb(16 24 40 / 6%);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.composer.dragging-files {
  border-color: #6172f3;
}

.drop-overlay {
  position: absolute;
  z-index: 3;
  inset: 5px;
  display: grid;
  place-items: center;
  border: 1px dashed #8098f9;
  border-radius: 16px;
  background: rgb(238 244 255 / 96%);
  color: #3538cd;
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
}

.composer:focus-within {
  border-color: #c7cdd5;
  box-shadow:
    0 1px 2px rgb(16 24 40 / 4%),
    0 10px 28px rgb(16 24 40 / 8%);
}

textarea {
  display: block;
  width: 100%;
  min-height: 26px;
  max-height: 160px;
  resize: none;
  overflow-y: auto;
  border: 0;
  outline: 0;
  background: transparent;
  color: #182230;
  font: inherit;
  font-size: 15px;
  line-height: 1.65;
}

textarea::placeholder {
  color: #98a2b3;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.composer-icon,
.send-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  cursor: pointer;
}

.composer-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: transparent;
  color: #667085;
}

.composer-icon:hover {
  background: #f2f4f7;
  color: #344054;
}

.composer-icon.active {
  background: #f4f3ff;
  color: #6941c6;
}

.composer-icon.auto {
  background: #f8f9fc;
  color: #475467;
  box-shadow: inset 0 0 0 1px #e4e7ec;
}

.composer-icon:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.spin {
  animation: spin 900ms linear infinite;
}

.attachment-error {
  margin: 6px 8px 0;
  color: #b42318;
  font-size: 11px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.composer-hint {
  flex: 1;
  color: #98a2b3;
  font-size: 11px;
  text-align: right;
}

.token-meter {
  display: inline-flex;
  min-width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 3px;
  border-radius: 8px;
  color: #667085;
  cursor: help;
  outline: none;
}

.token-meter:hover,
.token-meter:focus-visible {
  background: #f2f4f7;
}

.token-meter:focus-visible {
  box-shadow: 0 0 0 2px #98a2b3;
}

.token-ring {
  width: 25px;
  height: 25px;
  overflow: visible;
  transform: rotate(-90deg);
}

.token-ring-track,
.token-ring-progress {
  fill: none;
  stroke-width: 3.5;
}

.token-ring-track {
  stroke: #eaecf0;
}

.token-ring-progress {
  stroke: #667085;
  stroke-linecap: round;
  transition:
    stroke 180ms ease,
    stroke-dashoffset 240ms ease;
}

.token-meter.warning .token-ring-progress {
  stroke: #f79009;
}

.token-meter.full .token-ring-progress {
  stroke: #d92d20;
}

.token-meter.emergency .token-ring-progress {
  stroke: #b42318;
}

:global(.tooltip-content) {
  display: flex;
  z-index: 100;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border-radius: 7px;
  background: #101828;
  color: #ffffff;
  box-shadow: 0 6px 18px rgb(16 24 40 / 20%);
  font-size: 11px;
}

:global(.tooltip-content strong) {
  font-weight: 600;
}

:global(.tooltip-content span) {
  color: #d0d5dd;
}

.token-meter.compressing .token-ring-progress {
  stroke: #7f56d9;
  animation: token-pulse 900ms ease-in-out infinite alternate;
}

.compression-label {
  color: #6941c6;
  font-size: 11px;
  white-space: nowrap;
}

.send-button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #182230;
  color: #ffffff;
}

.send-button:disabled {
  background: #eaecf0;
  color: #98a2b3;
  cursor: default;
}

.send-button.sending {
  background: #344054;
}

.send-button.sending svg {
  animation: none;
}

.disclaimer {
  margin: 7px 0 0;
  color: #98a2b3;
  font-size: 10px;
  text-align: center;
}

@media (max-width: 720px) {
  .composer-hint {
    display: none;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes token-pulse {
  from {
    opacity: 0.45;
  }

  to {
    opacity: 1;
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  loadingChat: 正在加载对话…
  messagePlaceholder: 给 Lepus 发送消息
  chatMessage: 聊天消息
  addAttachment: 添加附件
  dropAttachments: 松开即可添加附件
  filePermissions: 当前对话的文件与权限
  taskMode:
    auto: 任务模式：自动判断
    on: 任务模式：强制开启
    off: 任务模式：关闭
    clickHint: 点击切换
  keyboardHint: Enter 发送 · Shift + Enter 换行
  historyTokenUsage: 历史对话 Token 用量
  tokenUsage: 上下文约 {current} / {trigger} Token
  compressing: 正在压缩
  compressingHistory: 正在压缩历史对话
  remainingBeforeCompression: 距离强制压缩约 {count} Token
  modelContext: 模型上下文：{source}为 {count} Token
  contextSource:
    manual: 手动设置
    detected: 自动识别
    fallback: 保守估算
  waitingForReply: 正在等待回复
  stopGenerating: 停止生成
  sendMessage: 发送消息
  disclaimer: Lepus 可能会犯错，请核查重要信息。
en:
  loadingChat: Loading chat…
  messagePlaceholder: Message Lepus
  chatMessage: Chat message
  addAttachment: Add attachment
  dropAttachments: Drop files to attach
  filePermissions: Files and permissions for this chat
  taskMode:
    auto: 'Task mode: Auto'
    on: 'Task mode: Always on'
    off: 'Task mode: Off'
    clickHint: Click to switch
  keyboardHint: Enter to send · Shift + Enter for a new line
  historyTokenUsage: Chat history token usage
  tokenUsage: About {current} / {trigger} context tokens
  compressing: Compressing
  compressingHistory: Compressing chat history
  remainingBeforeCompression: About {count} tokens until forced compression
  modelContext: 'Model context: {source}, {count} tokens'
  contextSource:
    manual: manually set
    detected: automatically detected
    fallback: conservatively estimated
  waitingForReply: Waiting for reply
  stopGenerating: Stop generating
  sendMessage: Send message
  disclaimer: Lepus can make mistakes. Check important information.
</i18n>
