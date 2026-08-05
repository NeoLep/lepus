<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import { Pencil, X } from '@lucide/vue'
import type { Session } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  session: Session | null
  saveTitle: (session: Session, title: string) => Promise<void>
}>()

const { t } = useI18n({ useScope: 'local' })
const input = ref<HTMLInputElement | null>(null)
const draft = ref('')
const saving = ref(false)
const error = ref('')

async function save(): Promise<void> {
  const session = props.session
  const title = draft.value.trim()
  if (!session || saving.value) return
  if (!title) {
    error.value = t('emptyTitle')
    return
  }
  if (title === session.title) {
    open.value = false
    return
  }

  saving.value = true
  error.value = ''
  try {
    await props.saveTitle(session, title)
    open.value = false
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : t('saveFailed')
  } finally {
    saving.value = false
  }
}

watch(
  () => [open.value, props.session?.id] as const,
  async ([isOpen]) => {
    if (!isOpen) return
    draft.value = props.session?.title ?? ''
    error.value = ''
    await nextTick()
    input.value?.focus()
    input.value?.select()
  }
)
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="rename-dialog-overlay" />
      <DialogContent class="rename-dialog-content" @open-auto-focus.prevent>
        <header class="rename-dialog-header">
          <span class="rename-dialog-icon"><Pencil :size="18" /></span>
          <div>
            <DialogTitle class="rename-dialog-title">{{ t('title') }}</DialogTitle>
            <DialogDescription class="rename-dialog-description">
              {{ t('description') }}
            </DialogDescription>
          </div>
          <DialogClose class="rename-dialog-close" :disabled="saving" :aria-label="t('close')">
            <X :size="18" />
          </DialogClose>
        </header>

        <form class="rename-form" @submit.prevent="save">
          <label for="session-title">{{ t('label') }}</label>
          <input
            id="session-title"
            ref="input"
            v-model="draft"
            type="text"
            maxlength="120"
            autocomplete="off"
            :placeholder="t('placeholder')"
            :disabled="saving"
            @input="error = ''"
          />
          <div class="rename-input-meta">
            <span v-if="error" class="rename-error">{{ error }}</span>
            <span v-else></span>
            <span>{{ draft.length }}/120</span>
          </div>

          <footer class="rename-dialog-actions">
            <DialogClose class="secondary-button" type="button" :disabled="saving">
              {{ t('cancel') }}
            </DialogClose>
            <button class="primary-button" type="submit" :disabled="saving || !draft.trim()">
              {{ saving ? t('saving') : t('save') }}
            </button>
          </footer>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.rename-dialog-overlay {
  position: fixed;
  z-index: 120;
  inset: 0;
  background: rgb(16 24 40 / 38%);
  backdrop-filter: blur(2px);
}

.rename-dialog-content {
  position: fixed;
  z-index: 121;
  top: 50%;
  left: 50%;
  width: min(430px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  outline: none;
  background: var(--app-surface);
  box-shadow: 0 24px 64px rgb(16 24 40 / 24%);
  transform: translate(-50%, -50%);
}

.rename-dialog-header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.rename-dialog-icon {
  display: inline-flex;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--app-surface-muted);
  color: var(--app-text-tertiary);
}

.rename-dialog-header > div {
  min-width: 0;
  flex: 1;
}

.rename-dialog-title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.4;
}

.rename-dialog-description {
  margin-top: 3px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.rename-dialog-close {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
}

.rename-dialog-close:hover {
  background: var(--app-surface-muted);
  color: var(--app-text-secondary);
}

.rename-form {
  margin-top: 18px;
}

.rename-form label {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.rename-form input {
  width: 100%;
  height: 40px;
  padding: 0 11px;
  border: 1px solid var(--app-border-strong);
  border-radius: 9px;
  outline: none;
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
}

.rename-form input:focus {
  border-color: var(--app-text-tertiary);
  box-shadow: 0 0 0 3px rgb(152 162 179 / 16%);
}

.rename-input-meta {
  display: flex;
  min-height: 20px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
  color: var(--app-text-muted);
  font-size: 10px;
}

.rename-input-meta .rename-error {
  color: var(--app-danger);
}

.rename-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.rename-dialog-actions button {
  height: 34px;
  padding: 0 13px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.secondary-button {
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-tertiary);
}

.primary-button {
  border: 1px solid #182230;
  background: #182230;
  color: #ffffff;
}

.rename-dialog-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 重命名会话
  description: 修改后的名称会显示在侧边栏和当前会话顶部。
  label: 会话名称
  placeholder: 输入会话名称
  emptyTitle: 会话名称不能为空
  saveFailed: 保存会话名称失败
  close: 关闭重命名弹窗
  cancel: 取消
  save: 保存
  saving: 保存中…
en:
  title: Rename chat
  description: The new name will appear in the sidebar and chat header.
  label: Chat name
  placeholder: Enter a chat name
  emptyTitle: Chat name cannot be empty
  saveFailed: Failed to save chat name
  close: Close rename dialog
  cancel: Cancel
  save: Save
  saving: Saving…
</i18n>
