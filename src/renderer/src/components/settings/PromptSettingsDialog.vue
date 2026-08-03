<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import { RotateCcw, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { ChatLocale, PromptSettings } from '@ipc/chat/constants'
import {
  DEFAULT_PROMPT_SETTINGS,
  PROMPT_CUSTOM_INSTRUCTIONS_MAX_LENGTH
} from '@/shared/agent/prompt-settings'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  saved: []
}>()
const { t, locale } = useI18n({ useScope: 'local' })
const draft = ref<PromptSettings>({ ...DEFAULT_PROMPT_SETTINGS })
const preview = ref('')
const loading = ref(false)
const saving = ref(false)
const previewing = ref(false)
const error = ref('')
let previewTimer: ReturnType<typeof setTimeout> | null = null
let previewVersion = 0

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    draft.value = await window.api.chat.queryPromptSettings()
    await refreshPreview()
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

async function refreshPreview(): Promise<void> {
  const version = ++previewVersion
  previewing.value = true
  try {
    const value = await window.api.chat.previewPrompt({
      settings: { ...draft.value },
      locale: locale.value as ChatLocale
    })
    if (version === previewVersion) preview.value = value
  } catch (previewError) {
    if (version === previewVersion) {
      error.value = previewError instanceof Error ? previewError.message : t('previewFailed')
    }
  } finally {
    if (version === previewVersion) previewing.value = false
  }
}

function schedulePreview(): void {
  if (!open.value || loading.value) return
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => void refreshPreview(), 180)
}

function reset(): void {
  draft.value = { ...DEFAULT_PROMPT_SETTINGS }
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    draft.value = await window.api.chat.updatePromptSettings({ ...draft.value })
    emit('saved')
    open.value = false
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : t('saveFailed')
  } finally {
    saving.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) void load()
})
watch(draft, schedulePreview, { deep: true })
watch(locale, schedulePreview)
onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="prompt-dialog-overlay" />
      <DialogContent class="prompt-dialog-content" @open-auto-focus.prevent>
        <header class="dialog-header">
          <div>
            <DialogTitle class="dialog-title">{{ t('title') }}</DialogTitle>
            <DialogDescription class="dialog-description">
              {{ t('description') }}
            </DialogDescription>
          </div>
          <DialogClose class="dialog-close" :aria-label="t('common.close')">
            <X :size="18" />
          </DialogClose>
        </header>

        <div class="dialog-body" :class="{ loading }">
          <section class="settings-panel">
            <label class="instructions-field">
              <span>{{ t('customInstructions') }}</span>
              <textarea
                v-model="draft.customInstructions"
                rows="9"
                :maxlength="PROMPT_CUSTOM_INSTRUCTIONS_MAX_LENGTH"
                :placeholder="t('instructionsPlaceholder')"
                :disabled="loading"
              ></textarea>
              <span class="field-help">
                <small>{{ t('instructionsHelp') }}</small>
                <small>
                  {{ draft.customInstructions.length.toLocaleString() }} /
                  {{ PROMPT_CUSTOM_INSTRUCTIONS_MAX_LENGTH.toLocaleString() }}
                </small>
              </span>
            </label>

            <fieldset>
              <legend>{{ t('runtimeContext') }}</legend>
              <label>
                <input v-model="draft.includeCurrentTime" type="checkbox" />
                <span>{{ t('includeCurrentTime') }}</span>
              </label>
              <label>
                <input v-model="draft.includeTimezone" type="checkbox" />
                <span>{{ t('includeTimezone') }}</span>
              </label>
              <label>
                <input v-model="draft.includeLocale" type="checkbox" />
                <span>{{ t('includeLocale') }}</span>
              </label>
              <label>
                <input v-model="draft.includePlatform" type="checkbox" />
                <span>{{ t('includePlatform') }}</span>
              </label>
            </fieldset>
          </section>

          <section class="preview-panel">
            <div class="preview-heading">
              <span>{{ t('preview') }}</span>
              <small>{{ previewing ? t('updatingPreview') : t('previewHelp') }}</small>
            </div>
            <pre>{{ preview }}</pre>
          </section>
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>

        <footer class="dialog-actions">
          <button class="reset-button" type="button" :disabled="loading || saving" @click="reset">
            <RotateCcw :size="15" />
            {{ t('resetDefaults') }}
          </button>
          <span></span>
          <DialogClose class="secondary-button" :disabled="saving">
            {{ t('common.cancel') }}
          </DialogClose>
          <button class="primary-button" type="button" :disabled="loading || saving" @click="save">
            {{ saving ? t('saving') : t('save') }}
          </button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.prompt-dialog-overlay {
  position: fixed;
  z-index: 90;
  inset: 0;
  background: rgb(16 24 40 / 36%);
}

.prompt-dialog-content {
  position: fixed;
  z-index: 91;
  top: 50%;
  left: 50%;
  display: flex;
  width: min(1040px, calc(100vw - 40px));
  max-height: min(650px, calc(100vh - 50px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dfe3e8;
  border-radius: 16px;
  outline: none;
  background: #ffffff;
  box-shadow: 0 24px 70px rgb(16 24 40 / 24%);
  transform: translate(-50%, -50%);
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 22px 17px;
  border-bottom: 1px solid #eaecf0;
}

.dialog-title {
  color: #101828;
  font-size: 18px;
  font-weight: 650;
}

.dialog-description {
  margin-top: 5px;
  color: #667085;
  font-size: 12px;
}

.dialog-close {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  cursor: pointer;
}

.dialog-close:hover {
  background: #f2f4f7;
}

.dialog-body {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(400px, 0.95fr) minmax(440px, 1.05fr);
  overflow: auto;
}

.dialog-body.loading {
  opacity: 0.6;
  pointer-events: none;
}

.settings-panel,
.preview-panel {
  min-width: 0;
  padding: 20px 22px;
}

.settings-panel {
  border-right: 1px solid #eaecf0;
}

.instructions-field > span,
fieldset legend,
.preview-heading > span {
  color: #344054;
  font-size: 12px;
  font-weight: 650;
}

.instructions-field textarea {
  display: block;
  width: 100%;
  margin-top: 7px;
  padding: 10px 11px;
  resize: vertical;
  border: 1px solid #d0d5dd;
  border-radius: 9px;
  outline: none;
  color: #182230;
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
}

.instructions-field textarea:focus {
  border-color: #7f8a9b;
  box-shadow: 0 0 0 3px rgb(152 162 179 / 16%);
}

.field-help {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.field-help small:first-child {
  min-width: 0;
  flex: 1;
}

.field-help small:last-child {
  flex: 0 0 auto;
  white-space: nowrap;
}

.instructions-field small {
  display: block;
  margin-top: 6px;
  color: #98a2b3;
  font-size: 10px;
  line-height: 1.5;
}

fieldset {
  display: grid;
  gap: 9px;
  margin: 20px 0 0;
  padding: 0;
  border: 0;
}

fieldset legend {
  margin-bottom: 9px;
}

fieldset label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #475467;
  font-size: 12px;
}

fieldset input {
  width: 15px;
  height: 15px;
  accent-color: #182230;
}

.preview-panel {
  display: flex;
  min-height: 350px;
  flex-direction: column;
  background: #f9fafb;
}

.preview-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.preview-heading small {
  color: #98a2b3;
  font-size: 10px;
}

.preview-panel pre {
  min-height: 0;
  flex: 1;
  margin: 0;
  padding: 13px 14px;
  overflow: auto;
  border: 1px solid #344054;
  border-radius: 10px;
  background: #182230;
  color: #e4e7ec;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.form-error {
  margin: 0;
  padding: 9px 22px;
  border-top: 1px solid #fecdca;
  background: #fffbfa;
  color: #d92d20;
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 20px;
  border-top: 1px solid #eaecf0;
}

.dialog-actions > span {
  flex: 1;
}

.reset-button,
.secondary-button,
.primary-button {
  display: inline-flex;
  height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 13px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.reset-button {
  border: 0;
  background: transparent;
  color: #475467;
}

.secondary-button {
  border: 1px solid #d0d5dd;
  background: #ffffff;
  color: #344054;
}

.primary-button {
  border: 1px solid #182230;
  background: #182230;
  color: #ffffff;
}

.reset-button:disabled,
.secondary-button:disabled,
.primary-button:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 720px) {
  .dialog-body {
    grid-template-columns: 1fr;
  }

  .settings-panel {
    border-right: 0;
    border-bottom: 1px solid #eaecf0;
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 提示词设置
  description: 自定义模型指令以及每次请求携带的动态环境信息。
  customInstructions: 自定义指令
  instructionsPlaceholder: 例如：回答代码问题时优先使用 TypeScript，回复尽量简洁。
  instructionsHelp: 自定义指令会追加在应用默认提示词之后，不会写入历史消息或参与摘要。
  runtimeContext: 动态运行环境
  includeCurrentTime: 携带当前时间
  includeTimezone: 携带时区
  includeLocale: 携带界面语言
  includePlatform: 携带操作系统
  preview: 最终 System Prompt 预览
  previewHelp: 实际发送时会重新生成时间
  updatingPreview: 正在更新…
  resetDefaults: 恢复默认
  save: 保存设置
  saving: 保存中…
  loadFailed: 加载提示词设置失败
  saveFailed: 保存提示词设置失败
  previewFailed: 生成提示词预览失败
en:
  title: Prompt settings
  description: Customize model instructions and the runtime context included with each request.
  customInstructions: Custom instructions
  instructionsPlaceholder: 'Example: Prefer TypeScript for code questions and keep responses concise.'
  instructionsHelp: Custom instructions are appended to the application prompt and are never stored in chat history or summaries.
  runtimeContext: Runtime context
  includeCurrentTime: Include current time
  includeTimezone: Include time zone
  includeLocale: Include interface language
  includePlatform: Include operating system
  preview: Final system prompt preview
  previewHelp: Time is regenerated when a message is sent
  updatingPreview: Updating…
  resetDefaults: Restore defaults
  save: Save settings
  saving: Saving…
  loadFailed: Failed to load prompt settings
  saveFailed: Failed to save prompt settings
  previewFailed: Failed to generate prompt preview
</i18n>
