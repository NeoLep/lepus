<script setup lang="ts">
import { ref, toRaw, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import { FolderOpen, GlobeLock, Plus, ShieldCheck, Trash2, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { PermissionMode, PermissionSettings } from '@ipc/chat/constants'
import { DEFAULT_PERMISSION_SETTINGS } from '@/shared/agent/permissions'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ sessionId: string | null }>()
const { t } = useI18n({ useScope: 'local' })
const draft = ref<PermissionSettings>({
  ...DEFAULT_PERMISSION_SETTINGS,
  trustedBrowserOrigins: []
})
const trustedOriginInput = ref('')
const loading = ref(false)
const saving = ref(false)
const selecting = ref(false)
const error = ref('')

const modes: PermissionMode[] = ['request_approval', 'auto_approve', 'full_access']

async function load(): Promise<void> {
  if (!props.sessionId) {
    draft.value = { ...DEFAULT_PERMISSION_SETTINGS, trustedBrowserOrigins: [] }
    trustedOriginInput.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const settings = await window.api.chat.queryPermissionSettings(props.sessionId)
    draft.value = { ...settings, trustedBrowserOrigins: [...settings.trustedBrowserOrigins] }
    trustedOriginInput.value = ''
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

function addTrustedOrigin(): boolean {
  const value = trustedOriginInput.value.trim()
  if (!value) return true
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error(t('trustedInvalid'))
    }
    const origin = url.origin
    if (!draft.value.trustedBrowserOrigins.includes(origin)) {
      if (draft.value.trustedBrowserOrigins.length >= 50) throw new Error(t('trustedLimit'))
      draft.value.trustedBrowserOrigins = [...draft.value.trustedBrowserOrigins, origin]
    }
    trustedOriginInput.value = ''
    error.value = ''
    return true
  } catch (originError) {
    error.value = originError instanceof Error ? originError.message : t('trustedInvalid')
    return false
  }
}

function removeTrustedOrigin(origin: string): void {
  draft.value.trustedBrowserOrigins = draft.value.trustedBrowserOrigins.filter(
    (item) => item !== origin
  )
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
  if (!addTrustedOrigin()) return
  saving.value = true
  error.value = ''
  try {
    draft.value = await window.api.chat.updatePermissionSettings({
      sessionId: props.sessionId,
      ...toRaw(draft.value)
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
              <strong>{{ t('trustedTitle') }}</strong>
              <small>{{ t('trustedHelp') }}</small>
            </div>
            <div class="trusted-origin-row">
              <div class="trusted-origin-input">
                <GlobeLock :size="16" />
                <input
                  v-model="trustedOriginInput"
                  type="url"
                  maxlength="2048"
                  :placeholder="t('trustedPlaceholder')"
                  @keydown.enter.prevent="addTrustedOrigin"
                />
              </div>
              <button
                type="button"
                :disabled="!trustedOriginInput.trim()"
                @click="addTrustedOrigin"
              >
                <Plus :size="14" /> {{ t('addTrusted') }}
              </button>
            </div>
            <div v-if="draft.trustedBrowserOrigins.length" class="trusted-origin-list">
              <div v-for="origin in draft.trustedBrowserOrigins" :key="origin">
                <GlobeLock :size="14" />
                <span :title="origin">{{ origin }}</span>
                <button
                  type="button"
                  :aria-label="t('removeTrusted')"
                  @click="removeTrustedOrigin(origin)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
            <p v-else class="trusted-empty">{{ t('trustedEmpty') }}</p>
            <p class="hard-rule">{{ t('trustedRule') }}</p>
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
  background: var(--app-dialog-overlay);
}

.permission-dialog-content {
  position: fixed;
  z-index: 91;
  top: 50%;
  left: 50%;
  display: flex;
  width: min(660px, calc(100vw - 40px));
  max-height: min(720px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 16px;
  outline: none;
  background: var(--app-surface);
  box-shadow: 0 24px 70px rgb(16 24 40 / 24%);
  transform: translate(-50%, -50%);
}

.dialog-header {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 11px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-surface);
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
  color: var(--app-text);
  font-size: 18px;
  font-weight: 650;
}

.dialog-description {
  margin-top: 4px;
  color: var(--app-text-tertiary);
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
  color: var(--app-text-tertiary);
  cursor: pointer;
}

.dialog-body {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  gap: 22px;
  padding: 20px 22px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
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
  color: var(--app-text-secondary);
  font-size: 12px;
}

.section-heading small,
.workspace-warning,
.hard-rule {
  color: var(--app-text-tertiary);
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
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  color: var(--app-text-secondary);
}

.folder-path.empty {
  color: var(--app-text-muted);
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
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-secondary);
}

.folder-row .clear-button {
  color: var(--app-danger);
}

.workspace-warning {
  margin: 7px 0 0;
  color: var(--app-warning);
}

.trusted-origin-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.trusted-origin-input {
  display: flex;
  min-width: 0;
  height: 36px;
  flex: 1;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  color: var(--app-text-tertiary);
}

.trusted-origin-input input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 11px;
}

.trusted-origin-row > button {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 5px;
  padding: 0 11px;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.trusted-origin-list {
  display: grid;
  gap: 6px;
  margin-top: 9px;
}

.trusted-origin-list > div {
  display: flex;
  min-width: 0;
  height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 7px 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-subtle);
  color: var(--app-accent);
}

.trusted-origin-list span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--app-text-secondary);
  font-family: ui-monospace, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trusted-origin-list button {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
}

.trusted-origin-list button:hover {
  background: var(--app-hover);
  color: var(--app-danger);
}

.trusted-empty {
  margin: 8px 0 0;
  color: var(--app-text-muted);
  font-size: 10px;
}

.mode-list {
  display: grid;
  gap: 8px;
}

.mode-list label {
  display: flex;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  background: var(--app-surface);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease;
}

.mode-list label:hover {
  border-color: var(--app-border-strong);
  background: var(--app-hover);
}

.mode-list label.selected,
.mode-list label.selected:hover {
  border-color: var(--app-accent-strong);
  background: var(--app-accent-soft);
}

.mode-list label:focus-within {
  border-color: var(--app-accent-strong);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 18%, transparent);
}

.mode-list input {
  margin-top: 2px;
  accent-color: var(--app-accent-strong);
}

.mode-list span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mode-list strong {
  color: var(--app-text-secondary);
  font-size: 12px;
}

.mode-list label.selected strong {
  color: var(--app-accent);
}

.mode-list small {
  color: var(--app-text-tertiary);
  font-size: 10px;
  line-height: 1.45;
}

.hard-rule {
  margin: 9px 0 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--app-surface-subtle);
}

.form-error {
  flex: 0 0 auto;
  margin: 0 22px 12px;
  color: var(--app-danger);
  font-size: 11px;
}

.dialog-actions {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px;
  border-top: 1px solid var(--app-border-subtle);
  background: var(--app-surface);
}

.secondary-button {
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-secondary);
}

.primary-button {
  border: 1px solid var(--app-inverse-bg);
  background: var(--app-inverse-bg);
  color: var(--app-agent-card-bg);
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
  trustedTitle: 浏览器信任地址
  trustedHelp: 信任后，在相同协议、主机和端口的页面中点击、输入和选择无需逐次审批。
  trustedPlaceholder: 例如 http://192.168.31.206:8080
  addTrusted: 添加
  removeTrusted: 移除信任地址
  trustedEmpty: 尚未添加信任地址。
  trustedRule: 信任仅适用于页面交互；浏览器安装、文件写入和其他高风险能力仍按原规则审批。
  trustedInvalid: 请输入包含 http:// 或 https:// 的有效地址，且不要包含用户名或密码。
  trustedLimit: 最多添加 50 个信任地址。
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
  trustedTitle: Trusted browser addresses
  trustedHelp: Clicks, typing, and selections require no per-action approval on pages with the same scheme, host, and port.
  trustedPlaceholder: For example, http://192.168.31.206:8080
  addTrusted: Add
  removeTrusted: Remove trusted address
  trustedEmpty: No trusted addresses yet.
  trustedRule: Trust applies only to page interaction; browser installation, file writes, and other high-risk capabilities keep their existing approval rules.
  trustedInvalid: Enter a valid address including http:// or https:// and do not include credentials.
  trustedLimit: You can add up to 50 trusted addresses.
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
