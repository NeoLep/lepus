<script setup lang="ts">
import { reactive } from 'vue'
import { ArrowUp, Check, HelpCircle, LoaderCircle, LockKeyhole } from '@lucide/vue'
import type { UserInputRequest } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

defineProps<{
  requests: UserInputRequest[]
  resolvingIds: string[]
}>()

const emit = defineEmits<{
  answer: [request: UserInputRequest, answer: string, selectedOptionId?: string]
}>()

const selectedByRequest = reactive<Record<string, string>>({})
const draftByRequest = reactive<Record<string, string>>({})
const { t } = useI18n({ useScope: 'local' })

function selectOption(request: UserInputRequest, optionId: string): void {
  selectedByRequest[request.id] = optionId
  draftByRequest[request.id] = ''
}

function updateDraft(request: UserInputRequest, value: string): void {
  draftByRequest[request.id] = value
  if (value.trim()) selectedByRequest[request.id] = ''
}

function handleDraftInput(request: UserInputRequest, event: Event): void {
  updateDraft(request, (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function submit(request: UserInputRequest): void {
  const selectedOptionId = selectedByRequest[request.id] || undefined
  const selectedOption = request.options.find((option) => option.id === selectedOptionId)
  const draft = draftByRequest[request.id] ?? ''
  const answer = selectedOption?.label ?? (request.sensitive ? draft : draft.trim())
  if (!answer.length) return
  emit('answer', request, answer, selectedOptionId)
  if (request.sensitive) delete draftByRequest[request.id]
}

function canSubmit(request: UserInputRequest): boolean {
  if (selectedByRequest[request.id]) return true
  const draft = draftByRequest[request.id] ?? ''
  return request.sensitive ? draft.length > 0 : Boolean(draft.trim())
}
</script>

<template>
  <div class="input-requests">
    <section v-for="request in requests" :key="request.id" class="input-card">
      <div class="question-heading">
        <LockKeyhole v-if="request.sensitive" :size="18" />
        <HelpCircle v-else :size="18" />
        <div>
          <strong>{{ t(request.sensitive ? 'sensitiveTitle' : 'title') }}</strong>
          <p>{{ request.question }}</p>
        </div>
      </div>

      <div v-if="request.options.length" class="options" role="radiogroup">
        <button
          v-for="option in request.options"
          :key="option.id"
          type="button"
          role="radio"
          :aria-checked="selectedByRequest[request.id] === option.id"
          :class="{ selected: selectedByRequest[request.id] === option.id }"
          :disabled="resolvingIds.includes(request.id)"
          @click="selectOption(request, option.id)"
        >
          <span class="option-check">
            <Check v-if="selectedByRequest[request.id] === option.id" :size="13" />
          </span>
          <span>
            <strong>{{ option.label }}</strong>
            <small v-if="option.description">{{ option.description }}</small>
          </span>
        </button>
      </div>

      <div v-if="request.allowFreeform" class="freeform">
        <span v-if="request.options.length">{{ t('orWrite') }}</span>
        <input
          v-if="request.sensitive"
          :value="draftByRequest[request.id] ?? ''"
          type="password"
          autocomplete="off"
          spellcheck="false"
          maxlength="2000"
          :placeholder="request.placeholder || t('sensitivePlaceholder')"
          :disabled="resolvingIds.includes(request.id)"
          @input="handleDraftInput(request, $event)"
          @keydown.enter.prevent="submit(request)"
        />
        <textarea
          v-else
          :value="draftByRequest[request.id] ?? ''"
          rows="2"
          maxlength="2000"
          :placeholder="request.placeholder || t('placeholder')"
          :disabled="resolvingIds.includes(request.id)"
          @input="handleDraftInput(request, $event)"
          @keydown.meta.enter.prevent="submit(request)"
          @keydown.ctrl.enter.prevent="submit(request)"
        ></textarea>
      </div>

      <div class="answer-actions">
        <span>{{ t(request.sensitive ? 'sensitiveHint' : 'hint') }}</span>
        <button
          type="button"
          :disabled="resolvingIds.includes(request.id) || !canSubmit(request)"
          @click="submit(request)"
        >
          <LoaderCircle v-if="resolvingIds.includes(request.id)" class="spin" :size="14" />
          <ArrowUp v-else :size="14" />
          {{ t('continue') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.input-requests {
  display: grid;
  gap: 10px;
  margin: 10px 0;
}

.input-card {
  padding: 13px;
  border: 1px solid #d9d6fe;
  border-radius: 13px;
  background: #fafaff;
}

.question-heading {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--app-accent);
}

.question-heading > svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.question-heading strong {
  font-size: 11px;
  font-weight: 650;
}

.question-heading p {
  margin: 3px 0 0;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.options {
  display: grid;
  gap: 6px;
  margin-top: 11px;
}

.options button {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  text-align: left;
  cursor: pointer;
}

.options button:hover,
.options button.selected {
  border-color: #9b8afb;
  background: var(--app-accent-soft);
}

.option-check {
  display: grid;
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  place-items: center;
  border: 1px solid var(--app-border-strong);
  border-radius: 50%;
  color: #ffffff;
}

.selected .option-check {
  border-color: var(--app-accent-strong);
  background: #7f56d9;
}

.options button > span:last-child {
  min-width: 0;
}

.options strong,
.options small {
  display: block;
}

.options strong {
  font-size: 12px;
}

.options small {
  margin-top: 2px;
  color: var(--app-text-tertiary);
  font-size: 10px;
  line-height: 1.45;
}

.freeform {
  margin-top: 10px;
}

.freeform > span {
  display: block;
  margin-bottom: 5px;
  color: var(--app-text-muted);
  font-size: 10px;
}

.freeform textarea,
.freeform input {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--app-border-strong);
  border-radius: 9px;
  outline: none;
  padding: 8px 9px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
}

.freeform textarea:focus,
.freeform input:focus {
  border-color: #9b8afb;
  box-shadow: 0 0 0 2px rgb(127 86 217 / 12%);
}

.answer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 9px;
}

.answer-actions > span {
  flex: 1;
  color: var(--app-text-muted);
  font-size: 10px;
}

.answer-actions button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: #6941c6;
  color: #ffffff;
  font-size: 11px;
  cursor: pointer;
}

.answer-actions button:disabled {
  background: var(--app-border);
  color: var(--app-text-muted);
  cursor: default;
}

.spin {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: Lepus 需要你的确认
  sensitiveTitle: Lepus 需要敏感信息
  orWrite: 或者补充你的具体要求
  placeholder: 输入你的想法或补充信息…
  sensitivePlaceholder: 输入内容不会发送给模型，也不会保存明文
  hint: 回答后将继续规划和执行
  sensitiveHint: 敏感内容仅用于本轮执行
  continue: 继续
en:
  title: Lepus needs your input
  sensitiveTitle: Lepus needs sensitive information
  orWrite: Or provide your own details
  placeholder: Add your preferences or details…
  sensitivePlaceholder: Input is not sent to the model or stored in plain text
  hint: Planning and execution will continue after your answer
  sensitiveHint: Sensitive content is used only for this run
  continue: Continue
</i18n>
