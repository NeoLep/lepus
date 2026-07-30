<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ArrowUp, LoaderCircle, Paperclip } from '@lucide/vue'

const props = defineProps<{
  sending: boolean
}>()

const emit = defineEmits<{
  submit: []
}>()

const model = defineModel<string>({ required: true })
const textarea = ref<HTMLTextAreaElement | null>(null)

function resizeTextarea(): void {
  const element = textarea.value
  if (!element) return

  element.style.height = '0'
  element.style.height = `${Math.min(element.scrollHeight, 160)}px`
}

function submit(): void {
  if (!model.value.trim() || props.sending) return
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
        placeholder="给 Lepus 发送消息"
        aria-label="聊天消息"
        @keydown="handleKeydown"
      ></textarea>

      <div class="composer-actions">
        <button class="composer-icon" type="button" aria-label="添加附件">
          <Paperclip :size="18" />
        </button>
        <span class="composer-hint">Enter 发送 · Shift + Enter 换行</span>
        <button
          class="send-button"
          type="submit"
          :class="{ sending }"
          :disabled="!model.trim() || sending"
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
</style>
