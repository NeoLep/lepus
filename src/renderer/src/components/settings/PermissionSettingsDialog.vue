<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import { FolderOpen, ShieldCheck, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { PermissionMode, PermissionSettings } from '@ipc/chat/constants'
import { DEFAULT_PERMISSION_SETTINGS } from '@/shared/agent/permissions'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ sessionId: string | null }>()
const { t } = useI18n({ useScope: 'local' })
const draft = ref<PermissionSettings>({ ...DEFAULT_PERMISSION_SETTINGS })
const loading = ref(false)
const saving = ref(false)
const selecting = ref(false)
const error = ref('')

const modes: PermissionMode[] = ['request_approval', 'auto_approve', 'full_access']

async function load(): Promise<void> {
  if (!props.sessionId) {
    draft.value = { ...DEFAULT_PERMISSION_SETTINGS }
    return
  }
  loading.value = true
  error.value = ''
  try {
    draft.value = await window.api.chat.queryPermissionSettings(props.sessionId)
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

async function selectFolder(): Promise<void> {
  selecting.value = true
  error.value = ''
  try {
    const selected = await window.api.chat.selectWorkspaceFolder()
    if (selected) draft.value.workspacePath = selected
  } catch (selectError) {
    error.value = selectError instanceof Error ? selectError.message : t('selectFailed')
  } finally {
    selecting.value = false
  }
}

async function save(): Promise<void> {
  if (saving.value || !props.sessionId) return
  saving.value = true
  error.value = ''
  try {
    draft.value = await window.api.chat.updatePermissionSettings({
      sessionId: props.sessionId,
      ...draft.value
    })
    open.value = false
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : t('saveFailed')
  } finally {
    saving.value = false
  }
}

watch(
  () => [open.value, props.sessionId] as const,
  ([isOpen]) => {
    if (isOpen) void load()
  }
)
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="permission-dialog-overlay" />
      <DialogContent class="permission-dialog-content" @open-auto-focus.prevent>
        <header class="dialog-header">
          <div class="title-icon"><ShieldCheck :size="19" /></div>
          <div>
            <DialogTitle class="dialog-title">{{ t('title') }}</DialogTitle>
            <DialogDescription class="dialog-description">{{ t('description') }}</DialogDescription>
          </div>
          <DialogClose class="dialog-close" :aria-label="t('common.close')">
            <X :size="18" />
          </DialogClose>
        </header>

        <div class="dialog-body" :class="{ loading }">
          <section>
            <div class="section-heading">
              <strong>{{ t('workspaceTitle') }}</strong>
              <small>{{ t('workspaceHelp') }}</small>
            </div>
            <div class="folder-row">
              <div class="folder-path" :class="{ empty: !draft.workspacePath }">
                <FolderOpen :size="16" />
                <span>{{ draft.workspacePath || t('noWorkspace') }}</span>
              </div>
              <button type="button" :disabled="selecting" @click="selectFolder">
                {{ selecting ? t('selecting') : t('chooseFolder') }}
              </button>
              <button
                v-if="draft.workspacePath"
                type="button"
                class="clear-button"
                @click="draft.workspacePath = ''"
              >
                {{ t('clear') }}
              </button>
            </div>
            <p v-if="!draft.workspacePath" class="workspace-warning">{{ t('disabledHelp') }}</p>
          </section>

          <section>
            <div class="section-heading">
              <strong>{{ t('permissionTitle') }}</strong>
              <small>{{ t('permissionHelp') }}</small>
            </div>
            <div class="mode-list">
              <label v-for="mode in modes" :key="mode" :class="{ selected: draft.mode === mode }">
                <input v-model="draft.mode" type="radio" :value="mode" />
                <span>
                  <strong>{{ t(`${mode}.title`) }}</strong>
                  <small>{{ t(`${mode}.description`) }}</small>
                </span>
              </label>
            </div>
            <p class="hard-rule">{{ t('hardRule') }}</p>
          </section>
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>

        <footer class="dialog-actions">
          <DialogClose class="secondary-button" :disabled="saving">{{
            t('common.cancel')
          }}</DialogClose>
          <button class="primary-button" type="button" :disabled="loading || saving" @click="save">
            {{ saving ? t('saving') : t('save') }}
          </button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.permission-dialog-overlay {
  position: fixed;
  z-index: 90;
  inset: 0;
  background: rgb(16 24 40 / 36%);
}

.permission-dialog-content {
  position: fixed;
  z-index: 91;
  top: 50%;
  left: 50%;
  width: min(660px, calc(100vw - 40px));
  max-height: min(720px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid #dfe3e8;
  border-radius: 16px;
  outline: none;
  background: #fff;
  box-shadow: 0 24px 70px rgb(16 24 40 / 24%);
  transform: translate(-50%, -50%);
}

.dialog-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 11px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid #eaecf0;
}

.title-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  background: #eef4ff;
  color: #175cd3;
}

.dialog-title {
  color: #101828;
  font-size: 18px;
  font-weight: 650;
}

.dialog-description {
  margin-top: 4px;
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

.dialog-body {
  display: grid;
  gap: 22px;
  padding: 20px 22px;
}

.dialog-body.loading {
  opacity: 0.55;
  pointer-events: none;
}

.section-heading {
  display: flex;
  margin-bottom: 10px;
  flex-direction: column;
  gap: 3px;
}

.section-heading strong {
  color: #344054;
  font-size: 12px;
}

.section-heading small,
.workspace-warning,
.hard-rule {
  color: #667085;
  font-size: 10px;
  line-height: 1.5;
}

.folder-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.folder-path {
  display: flex;
  min-width: 0;
  height: 36px;
  flex: 1;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  color: #344054;
}

.folder-path.empty {
  color: #98a2b3;
}

.folder-path span {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-row button,
.dialog-actions button {
  height: 34px;
  padding: 0 11px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.folder-row button {
  border: 1px solid #d0d5dd;
  background: #fff;
  color: #344054;
}

.folder-row .clear-button {
  color: #b42318;
}

.workspace-warning {
  margin: 7px 0 0;
  color: #b54708;
}

.mode-list {
  display: grid;
  gap: 8px;
}

.mode-list label {
  display: flex;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid #e4e7ec;
  border-radius: 9px;
  cursor: pointer;
}

.mode-list label.selected {
  border-color: #84adff;
  background: #f5f8ff;
}

.mode-list input {
  margin-top: 2px;
}

.mode-list span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mode-list strong {
  color: #344054;
  font-size: 12px;
}

.mode-list small {
  color: #667085;
  font-size: 10px;
  line-height: 1.45;
}

.hard-rule {
  margin: 9px 0 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: #f9fafb;
}

.form-error {
  margin: 0 22px 12px;
  color: #b42318;
  font-size: 11px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px;
  border-top: 1px solid #eaecf0;
}

.secondary-button {
  border: 1px solid #d0d5dd;
  background: #fff;
  color: #344054;
}

.primary-button {
  border: 1px solid #182230;
  background: #182230;
  color: #fff;
}

button:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 文件与权限
  description: 为当前对话选择安全工作文件夹，并控制文件和互联网工具的审批方式。
  workspaceTitle: 工作文件夹
  workspaceHelp: 相对路径会以此文件夹为根目录；该目录视为安全工作区。
  noWorkspace: 尚未选择文件夹
  chooseFolder: 选择文件夹
  selecting: 正在选择
  clear: 清除
  disabledHelp: 选择文件夹前，文件读取和写入工具不会提供给模型。
  permissionTitle: 权限模式
  permissionHelp: 你可以随时调整；新的设置从下一次对话请求开始生效。
  request_approval:
    title: 请求批准
    description: 访问工作文件夹之外的文件和使用互联网时始终询问。
  auto_approve:
    title: 替我审批
    description: 自动执行常规操作，仅对敏感文件、外部写入和检测到的风险操作询问。
  full_access:
    title: 完全访问权限
    description: 不受限制地访问互联网并读取电脑文件；外部写入和删除仍需批准。
  hardRule: 安全规则：无论选择哪种模式，写入或删除安全工作文件夹之外的目标都必须逐次批准。
  save: 保存设置
  saving: 正在保存
  loadFailed: 加载权限设置失败
  selectFailed: 选择文件夹失败
  saveFailed: 保存权限设置失败
en:
  title: Files and permissions
  description: Choose a safe workspace folder and approval policy for the current chat.
  workspaceTitle: Workspace folder
  workspaceHelp: Relative paths resolve from this folder, which is treated as the safe workspace.
  noWorkspace: No folder selected
  chooseFolder: Choose folder
  selecting: Selecting
  clear: Clear
  disabledHelp: File read and write tools are unavailable until a folder is selected.
  permissionTitle: Permission mode
  permissionHelp: You can change this at any time; new settings apply to the next chat request.
  request_approval:
    title: Request approval
    description: Always ask before internet access or accessing files outside the workspace.
  auto_approve:
    title: Auto approve
    description: Run routine actions automatically and ask only for sensitive files, external writes, and detected risks.
  full_access:
    title: Full access
    description: Unrestricted internet and file reads; external writes and deletions still require approval.
  hardRule: 'Safety rule: writing or deleting outside the safe workspace always requires per-operation approval in every mode.'
  save: Save settings
  saving: Saving
  loadFailed: Failed to load permission settings
  selectFailed: Failed to select folder
  saveFailed: Failed to save permission settings
</i18n>
