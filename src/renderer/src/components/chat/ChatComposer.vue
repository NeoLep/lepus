<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowUp, LoaderCircle, Paperclip } from '@lucide/vue'
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'
import type { CompressionStatus } from '@ipc/chat/constants'

const props = defineProps<{
  sending: boolean
  disabled: boolean
  placeholder?: string
  compressionStatus: CompressionStatus
  compressing: boolean
}>()

const emit = defineEmits<{
  submit: []
}>()

const model = defineModel<string>({ required: true })
const textarea = ref<HTMLTextAreaElement | null>(null)
const ringProgress = computed(() => Math.min(Math.max(props.compressionStatus.usageRatio, 0), 1))
const ringOffset = computed(() => 100 - ringProgress.value * 100)
const tokenLabel = computed(() => {
  const current = props.compressionStatus.estimatedTokens.toLocaleString()
  const trigger = props.compressionStatus.triggerTokens.toLocaleString()
  return `上下文约 ${current} / ${trigger} Token`
})
const remainingTokens = computed(() =>
  Math.max(
    0,
    props.compressionStatus.triggerTokens - props.compressionStatus.estimatedTokens
  ).toLocaleString()
)
const contextSourceLabel = computed(() => {
  const labels = { manual: '手动设置', detected: '自动识别', fallback: '保守估算' } as const
  return labels[props.compressionStatus.contextWindowSource]
})

function resizeTextarea(): void {
  const element = textarea.value
  if (!element) return

  element.style.height = '0'
  element.style.height = `${Math.min(element.scrollHeight, 160)}px`
}

function submit(): void {
  if (!model.value.trim() || props.sending || props.disabled) return
  emit('submit')
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
    <form class="composer" @submit.prevent="submit">
      <textarea
        ref="textarea"
        v-model="model"
        rows="1"
        :placeholder="disabled ? (placeholder ?? '正在加载对话…') : '给 Lepus 发送消息'"
        aria-label="聊天消息"
        :disabled="disabled"
        @keydown="handleKeydown"
      ></textarea>

      <div class="composer-actions">
        <button class="composer-icon" type="button" aria-label="添加附件">
          <Paperclip :size="18" />
        </button>
        <span class="composer-hint">Enter 发送 · Shift + Enter 换行</span>
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
              aria-label="历史对话 Token 用量"
              :aria-valuetext="compressing ? '正在压缩历史对话' : tokenLabel"
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
              <span v-if="compressing" class="compression-label">正在压缩</span>
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent class="tooltip-content" side="top" :side-offset="7">
              <template v-if="compressing">正在压缩历史对话</template>
              <template v-else>
                <strong>{{ tokenLabel }}</strong>
                <span>距离强制压缩约 {{ remainingTokens }} Token</span>
                <span>
                  模型上下文：{{ contextSourceLabel }}为
                  {{ compressionStatus.contextWindow.toLocaleString() }} Token
                </span>
              </template>
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
        <button
          class="send-button"
          type="submit"
          :class="{ sending }"
          :disabled="!model.trim() || sending || disabled"
          :aria-label="sending ? '正在等待回复' : '发送消息'"
        >
          <LoaderCircle v-if="sending" :size="16" />
          <ArrowUp v-else :size="18" :stroke-width="2.4" />
        </button>
      </div>
    </form>
    <p class="disclaimer">Lepus 可能会犯错，请核查重要信息。</p>
  </div>
</template>

<style scoped>
.composer-wrap {
  width: min(760px, calc(100% - 32px));
  margin: 0 auto;
  padding: 12px 0 10px;
}

.composer {
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
  animation: spin 900ms linear infinite;
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
