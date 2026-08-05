<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ArrowUp,
  Check,
  FolderCog,
  ListTodo,
  LoaderCircle,
  Paperclip,
  Square,
  Users,
  X
} from '@lucide/vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  TooltipContent,
  TooltipPortal,
  TooltipRoot,
  TooltipTrigger
} from 'reka-ui'
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
  toggleTaskMode: [preference: TaskModePreference]
}>()

const { t, locale } = useI18n({ useScope: 'local' })
const formatNumber = (value: number): string => new Intl.NumberFormat(locale.value).format(value)

const model = defineModel<string>({ required: true })
const textarea = ref<HTMLTextAreaElement | null>(null)
const draggingFiles = ref(false)
const taskModeDialogOpen = ref(false)
const taskModes: TaskModePreference[] = ['auto', 'on', 'off']
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

async function prepareMultiAgentPrompt(): Promise<void> {
  if (props.disabled || props.sending) return
  if (props.taskMode === 'off') emit('toggleTaskMode', 'on')
  const prefix = t('multiAgentTemplate')
  model.value = model.value.trim() ? `${prefix}\n${model.value}` : prefix
  await nextTick()
  textarea.value?.focus()
  resizeTextarea()
}

function selectTaskMode(mode: TaskModePreference): void {
  if (mode !== props.taskMode) emit('toggleTaskMode', mode)
  taskModeDialogOpen.value = false
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
              :disabled="disabled || sending"
              :aria-label="t('multiAgent')"
              @click="prepareMultiAgentPrompt"
            >
              <Users :size="18" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent class="tooltip-content" side="top" :side-offset="7">
              {{ t('multiAgentHint') }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
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
              @click="taskModeDialogOpen = true"
            >
              <ListTodo :size="18" />
              <span v-if="taskMode === 'auto'" class="task-mode-auto-badge" aria-hidden="true">
                A
              </span>
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

    <DialogRoot v-model:open="taskModeDialogOpen">
      <DialogPortal>
        <DialogOverlay class="task-mode-dialog-overlay" />
        <DialogContent class="task-mode-dialog-content">
          <header class="task-mode-dialog-header">
            <span class="task-mode-dialog-icon"><ListTodo :size="19" /></span>
            <div class="task-mode-dialog-heading">
              <DialogTitle class="task-mode-dialog-title">
                {{ t('taskModeDialog.title') }}
              </DialogTitle>
              <DialogDescription class="task-mode-dialog-description">
                {{ t('taskModeDialog.description') }}
              </DialogDescription>
            </div>
            <DialogClose class="task-mode-dialog-close" :aria-label="t('taskModeDialog.close')">
              <X :size="18" />
            </DialogClose>
          </header>

          <div class="task-mode-options" role="radiogroup" :aria-label="t('taskModeDialog.title')">
            <button
              v-for="mode in taskModes"
              :key="mode"
              class="task-mode-option"
              :class="{ selected: taskMode === mode }"
              type="button"
              role="radio"
              :aria-checked="taskMode === mode"
              @click="selectTaskMode(mode)"
            >
              <span class="task-mode-option-copy">
                <strong>{{ t(`taskModeDialog.modes.${mode}.title`) }}</strong>
                <span>{{ t(`taskModeDialog.modes.${mode}.description`) }}</span>
              </span>
              <span class="task-mode-option-check" aria-hidden="true">
                <Check v-if="taskMode === mode" :size="16" :stroke-width="2.5" />
              </span>
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
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
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: transparent;
  color: #667085;
}

.task-mode-auto-badge {
  position: absolute;
  right: 1px;
  bottom: 1px;
  display: inline-flex;
  width: 13px;
  height: 13px;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #ffffff;
  border-radius: 50%;
  background: #475467;
  color: #ffffff;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
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

:global(.task-mode-dialog-overlay) {
  position: fixed;
  z-index: 110;
  inset: 0;
  background: rgb(16 24 40 / 38%);
  backdrop-filter: blur(2px);
}

:global(.task-mode-dialog-content) {
  position: fixed;
  z-index: 111;
  top: 50%;
  left: 50%;
  width: min(460px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid #eaecf0;
  border-radius: 18px;
  outline: none;
  background: #ffffff;
  box-shadow: 0 24px 64px rgb(16 24 40 / 22%);
  transform: translate(-50%, -50%);
}

.task-mode-dialog-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.task-mode-dialog-icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: #f4f3ff;
  color: #6941c6;
}

.task-mode-dialog-heading {
  min-width: 0;
  flex: 1;
}

.task-mode-dialog-title {
  color: #182230;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.4;
}

.task-mode-dialog-description {
  margin-top: 3px;
  color: #667085;
  font-size: 12px;
  line-height: 1.55;
}

.task-mode-dialog-close {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  cursor: pointer;
}

.task-mode-dialog-close:hover {
  background: #f2f4f7;
  color: #344054;
}

.task-mode-options {
  display: grid;
  gap: 9px;
  margin-top: 18px;
}

.task-mode-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 14px;
  padding: 13px 14px;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  background: #ffffff;
  color: #344054;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.task-mode-option:hover {
  border-color: #c7cdd5;
  background: #f9fafb;
}

.task-mode-option.selected {
  border-color: #9b8afb;
  background: #f9f7ff;
  box-shadow: 0 0 0 1px rgb(127 86 217 / 8%);
}

.task-mode-option-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 3px;
}

.task-mode-option-copy strong {
  color: #182230;
  font-size: 13px;
  font-weight: 650;
}

.task-mode-option-copy span {
  color: #667085;
  font-size: 11px;
  line-height: 1.5;
}

.task-mode-option-check {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid #d0d5dd;
  border-radius: 50%;
  color: #6941c6;
}

.task-mode-option.selected .task-mode-option-check {
  border-color: #9b8afb;
  background: #f4f3ff;
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
  multiAgent: 使用子 Agent
  multiAgentHint: 插入并行委派提示，并自动开启任务模式
  multiAgentTemplate: 请使用子 Agent 并行处理以下任务：
  taskMode:
    auto: 任务模式：自动判断
    on: 任务模式：强制开启
    off: 任务模式：关闭
    clickHint: 点击选择
  taskModeDialog:
    title: 选择任务模式
    description: 控制 Lepus 何时启用任务计划、交互追问和子 Agent。
    close: 关闭任务模式选择
    modes:
      auto:
        title: 自动判断
        description: 根据请求复杂度自动启用；明确要求使用子 Agent 时也会启用。
      on:
        title: 强制开启
        description: 每次请求都启用任务工作流，并提供计划、追问和子 Agent 能力。
      off:
        title: 关闭
        description: 不启用任务计划、交互追问或子 Agent。
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
  multiAgent: Use sub-agents
  multiAgentHint: Insert a delegation prompt and enable task mode
  multiAgentTemplate: 'Use sub-agents to handle these tasks in parallel:'
  taskMode:
    auto: 'Task mode: Auto'
    on: 'Task mode: Always on'
    off: 'Task mode: Off'
    clickHint: Click to choose
  taskModeDialog:
    title: Choose task mode
    description: Control when Lepus uses task plans, follow-up questions, and sub-agents.
    close: Close task mode selection
    modes:
      auto:
        title: Auto
        description: Enable based on request complexity, including explicit sub-agent requests.
      on:
        title: Always on
        description: Use the task workflow for every request, with plans, questions, and sub-agents.
      off:
        title: 'Off'
        description: Do not use task plans, interactive questions, or sub-agents.
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
