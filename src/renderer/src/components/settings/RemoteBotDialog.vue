<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { ref } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import { Bot, CircleAlert, FolderOpen, LoaderCircle, Radio, X } from '@lucide/vue'
import type { RemoteBotSettings, RemoteBotStatus, RemoteBotToolGroup } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const { t } = useI18n({ useScope: 'local' })
const loading = ref(false)
const saving = ref(false)
const selectingFolder = ref(false)
const error = ref('')
const draft = ref<RemoteBotSettings>({
  enabled: false,
  platform: 'feishu',
  appId: '',
  appSecret: '',
  hasAppSecret: false,
  allowedOpenIds: [],
  allowedToolGroups: ['utilities', 'web_search', 'workspace_read', 'skills'],
  workspacePath: '',
  maxToolRounds: 12
})
const allowedOpenIdsText = ref('')
const status = ref<RemoteBotStatus>({
  state: 'stopped',
  message: '',
  updatedAt: new Date().toISOString()
})

const statusLabel = computed(() => t(`status.${status.value.state}`))
const lastSenderHint = computed(() => {
  if (!status.value.lastSenderOpenId) return ''
  return t('lastSender', { id: status.value.lastSenderOpenId })
})
const toolGroups = computed<Array<{ id: RemoteBotToolGroup; title: string; description: string }>>(
  () => [
    { id: 'utilities', title: t('tools.utilities'), description: t('tools.utilitiesHint') },
    { id: 'web_search', title: t('tools.webSearch'), description: t('tools.webSearchHint') },
    {
      id: 'workspace_read',
      title: t('tools.workspaceRead'),
      description: t('tools.workspaceReadHint')
    },
    { id: 'skills', title: t('tools.skills'), description: t('tools.skillsHint') },
    { id: 'browser', title: t('tools.browser'), description: t('tools.browserHint') },
    { id: 'clipboard', title: t('tools.clipboard'), description: t('tools.clipboardHint') }
  ]
)

async function selectWorkspace(): Promise<void> {
  selectingFolder.value = true
  error.value = ''
  try {
    const selected = await window.api.chat.selectWorkspaceFolder()
    if (selected) draft.value.workspacePath = selected
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('selectFolderFailed')
  } finally {
    selectingFolder.value = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [settings, currentStatus] = await Promise.all([
      window.api.chat.queryRemoteBotSettings(),
      window.api.chat.queryRemoteBotStatus()
    ])
    draft.value = {
      ...settings,
      appSecret: '',
      allowedOpenIds: [...settings.allowedOpenIds],
      allowedToolGroups: [...settings.allowedToolGroups]
    }
    allowedOpenIdsText.value = settings.allowedOpenIds.join('\n')
    status.value = currentStatus
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    const saved = await window.api.chat.updateRemoteBotSettings({
      enabled: draft.value.enabled,
      platform: 'feishu',
      appId: draft.value.appId.trim(),
      appSecret: draft.value.appSecret.trim(),
      hasAppSecret: draft.value.hasAppSecret,
      allowedOpenIds: allowedOpenIdsText.value
        .split(/[\n,，]/)
        .map((id) => id.trim())
        .filter(Boolean),
      allowedToolGroups: [...draft.value.allowedToolGroups],
      workspacePath: draft.value.workspacePath,
      maxToolRounds: draft.value.maxToolRounds
    })
    draft.value = {
      ...saved,
      appSecret: '',
      allowedOpenIds: [...saved.allowedOpenIds],
      allowedToolGroups: [...saved.allowedToolGroups]
    }
    allowedOpenIdsText.value = saved.allowedOpenIds.join('\n')
    status.value = await window.api.chat.queryRemoteBotStatus()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('saveFailed')
  } finally {
    saving.value = false
  }
}

watch(
  open,
  (value) => {
    if (value) void load()
  },
  { immediate: true }
)

const removeStatusListener = window.api.chat.onRemoteBotStatusChanged((nextStatus) => {
  status.value = nextStatus
})
onBeforeUnmount(removeStatusListener)
</script>

<template>
  <DialogRoot v-model:open="open" :modal="!props.embedded">
    <DialogPortal :disabled="props.embedded">
      <DialogOverlay v-if="!props.embedded" class="remote-overlay" />
      <DialogContent
        class="remote-dialog"
        :class="{ embedded: props.embedded }"
        @open-auto-focus.prevent
      >
        <header class="remote-header">
          <span class="remote-icon"><Bot :size="19" /></span>
          <div>
            <DialogTitle>{{ t('title') }}</DialogTitle>
            <DialogDescription>{{ t('description') }}</DialogDescription>
          </div>
          <DialogClose v-if="!props.embedded" class="close-button" :aria-label="t('common.close')"
            ><X :size="18"
          /></DialogClose>
        </header>

        <div v-if="loading" class="loading-row">
          <LoaderCircle class="spin" :size="18" /> {{ t('common.loading') }}
        </div>
        <form v-else class="remote-form" @submit.prevent="save">
          <section class="status-card" :class="status.state">
            <Radio :size="17" />
            <div>
              <strong>{{ statusLabel }}</strong>
              <p>{{ status.message || t('statusHint') }}</p>
              <small v-if="lastSenderHint">{{ lastSenderHint }}</small>
            </div>
          </section>

          <label class="toggle-row">
            <div>
              <strong>{{ t('enable') }}</strong>
              <small>{{ t('enableHint') }}</small>
            </div>
            <input v-model="draft.enabled" type="checkbox" />
          </label>

          <section class="platform-card">
            <span class="platform-logo">飞</span>
            <div>
              <strong>飞书</strong><small>{{ t('onlyPlatform') }}</small>
            </div>
          </section>

          <label>
            <span>App ID</span>
            <input v-model="draft.appId" autocomplete="off" placeholder="cli_xxxxxxxxxxxxxxxx" />
          </label>
          <label>
            <span>App Secret</span>
            <input
              v-model="draft.appSecret"
              type="password"
              autocomplete="new-password"
              :placeholder="draft.hasAppSecret ? t('secretSaved') : t('secretPlaceholder')"
            />
            <small>{{ t('secretHint') }}</small>
          </label>
          <label>
            <span>{{ t('allowlist') }}</span>
            <textarea
              v-model="allowedOpenIdsText"
              rows="3"
              placeholder="ou_xxxxxxxxxxxxxxxx"
            ></textarea>
            <small>{{ t('allowlistHint') }}</small>
          </label>

          <section class="capability-section">
            <div class="section-heading">
              <div>
                <strong>{{ t('capabilities') }}</strong>
                <small>{{ t('capabilitiesHint') }}</small>
              </div>
              <span>{{ t('selectedCount', { count: draft.allowedToolGroups.length }) }}</span>
            </div>
            <label v-for="group in toolGroups" :key="group.id" class="capability-row">
              <input v-model="draft.allowedToolGroups" type="checkbox" :value="group.id" />
              <span>
                <strong>{{ group.title }}</strong>
                <small>{{ group.description }}</small>
              </span>
            </label>
          </section>

          <section v-if="draft.allowedToolGroups.includes('workspace_read')" class="workspace-card">
            <div>
              <strong>{{ t('workspace') }}</strong>
              <small>{{ draft.workspacePath || t('workspaceEmpty') }}</small>
            </div>
            <button type="button" :disabled="selectingFolder" @click="selectWorkspace">
              <LoaderCircle v-if="selectingFolder" class="spin" :size="15" />
              <FolderOpen v-else :size="15" />
              {{ t('chooseFolder') }}
            </button>
            <button
              v-if="draft.workspacePath"
              type="button"
              class="text-button"
              @click="draft.workspacePath = ''"
            >
              {{ t('clearFolder') }}
            </button>
          </section>

          <label>
            <span>{{ t('maxToolRounds') }}</span>
            <input v-model.number="draft.maxToolRounds" type="number" min="2" max="20" />
            <small>{{ t('maxToolRoundsHint') }}</small>
          </label>

          <aside class="setup-guide">
            <strong>{{ t('setupTitle') }}</strong>
            <ol>
              <li>{{ t('setupCreate') }}</li>
              <li>{{ t('setupPermission') }}</li>
              <li>{{ t('setupEvent') }} <code>im.message.receive_v1</code></li>
              <li>{{ t('setupPublish') }}</li>
            </ol>
            <a href="https://open.feishu.cn/app/" target="_blank" rel="noreferrer">{{
              t('openConsole')
            }}</a>
          </aside>

          <p class="safety-note"><CircleAlert :size="15" />{{ t('safety') }}</p>
          <p v-if="error" class="error-message">{{ error }}</p>

          <footer>
            <DialogClose v-if="!props.embedded" type="button">{{ t('common.cancel') }}</DialogClose>
            <button class="primary" type="submit" :disabled="saving">
              <LoaderCircle v-if="saving" class="spin" :size="16" />
              {{ saving ? t('saving') : t('save') }}
            </button>
          </footer>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.remote-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgb(15 23 42 / 42%);
  backdrop-filter: blur(2px);
}
.remote-dialog {
  position: fixed;
  z-index: 81;
  top: 50%;
  left: 50%;
  width: min(620px, calc(100vw - 32px));
  max-height: min(780px, calc(100vh - 32px));
  overflow: auto;
  transform: translate(-50%, -50%);
  border: 1px solid var(--app-border);
  border-radius: 18px;
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 24px 80px rgb(15 23 42 / 28%);
}

.remote-dialog.embedded {
  position: relative;
  z-index: auto;
  top: auto;
  left: auto;
  display: grid;
  width: 100%;
  height: 100%;
  max-height: none;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transform: none;
  grid-template-rows: auto minmax(0, 1fr);
}
.remote-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--app-border);
}
.remote-header h2 {
  margin: 0;
  font-size: 18px;
}
.remote-header p {
  margin: 4px 0 0;
  color: var(--app-text-muted);
  font-size: 13px;
}
.remote-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  color: #3370ff;
  background: rgb(51 112 255 / 12%);
}
.close-button {
  border: 0;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}
.remote-form {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 16px;
  padding: 20px 22px 22px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.remote-form label:not(.toggle-row) {
  display: grid;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
}
.remote-form input:not([type='checkbox']),
.remote-form textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 9px 11px;
  outline: none;
  color: var(--app-text);
  background: var(--app-surface);
  font: inherit;
  resize: vertical;
}
.remote-form input:not([type='checkbox']):focus,
.remote-form textarea:focus {
  border-color: #7f8a9b;
  box-shadow: 0 0 0 3px rgb(152 162 179 / 16%);
}
.remote-form label small,
.platform-card small {
  color: var(--app-text-muted);
  font-weight: 400;
}
.status-card,
.platform-card,
.toggle-row {
  display: flex;
  gap: 11px;
  align-items: center;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--app-surface-subtle);
}
.capability-section {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 10px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--app-surface-subtle);
}
.section-heading > div,
.capability-row > span,
.workspace-card > div {
  display: grid;
  gap: 3px;
}
.section-heading small,
.capability-row small,
.workspace-card small {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 400;
}
.section-heading > span {
  color: var(--app-text-muted);
  font-size: 12px;
}
.capability-row {
  display: grid !important;
  grid-template-columns: auto 1fr;
  gap: 10px !important;
  align-items: start;
  padding: 11px 14px;
  border-top: 1px solid var(--app-border);
  cursor: pointer;
}
.capability-row input {
  width: 17px;
  height: 17px;
  margin: 1px 0 0;
  accent-color: #3370ff;
}
.workspace-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
}
.workspace-card > div {
  min-width: 0;
  flex: 1;
}
.workspace-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-card button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  padding: 7px 9px;
  background: var(--app-surface);
  color: var(--app-text);
  cursor: pointer;
}
.workspace-card .text-button {
  border-color: transparent;
  color: var(--app-text-muted);
}
.status-card > div,
.platform-card > div,
.toggle-row > div {
  display: grid;
  gap: 3px;
  flex: 1;
}
.status-card p {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
}
.status-card.connected {
  border-color: rgb(22 163 74 / 35%);
  color: #16a34a;
}
.status-card.error {
  border-color: rgb(220 38 38 / 35%);
  color: #dc2626;
}
.status-card.connecting {
  color: #d97706;
}
.toggle-row {
  cursor: pointer;
}
.toggle-row small {
  color: var(--app-text-muted);
  font-weight: 400;
}
.toggle-row input {
  width: 18px;
  height: 18px;
  accent-color: #3370ff;
}
.platform-logo {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  background: #3370ff;
  color: white;
  font-weight: 700;
}
.setup-guide {
  border-radius: 12px;
  padding: 14px 16px;
  background: rgb(51 112 255 / 8%);
  font-size: 13px;
}
.setup-guide ol {
  margin: 9px 0;
  padding-left: 20px;
  line-height: 1.75;
  color: var(--app-text-muted);
}
.setup-guide a {
  color: #3370ff;
  text-decoration: none;
}
.safety-note {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}
.error-message {
  margin: 0;
  color: #dc2626;
  font-size: 13px;
}
.loading-row {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 48px;
  color: var(--app-text-muted);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  padding-top: 4px;
}
footer button {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  border: 1px solid var(--app-border);
  height: 36px;
  border-radius: 8px;
  padding: 0 14px;
  background: var(--app-surface);
  color: var(--app-text);
  cursor: pointer;
}
footer .primary {
  border-color: var(--app-inverse-bg);
  background: var(--app-inverse-bg);
  color: var(--app-inverse-text);
  font-weight: 600;
}
footer button:disabled {
  opacity: 0.6;
  cursor: default;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 远程接入
  description: 通过飞书机器人和这台电脑上的 Lepus 对话。
  enable: 启用远程机器人
  enableHint: Lepus 运行期间保持飞书长连接。
  onlyPlatform: 当前版本唯一支持的平台
  secretSaved: 已安全保存；留空则不修改
  secretPlaceholder: 飞书应用凭据
  secretHint: App Secret 使用系统安全存储加密，不会显示在界面中。
  allowlist: 允许的飞书用户 Open ID
  allowlistHint: 每行一个；留空则允许应用可见范围内的所有用户。首次收到消息后，可从上方状态复制 Open ID。
  setupTitle: 飞书后台配置
  setupCreate: 创建企业自建应用并添加机器人能力。
  setupPermission: 开通接收消息、以应用身份发送消息和“获取用户基本信息”权限。
  setupEvent: 事件订阅选择“使用长连接”，添加事件
  setupPublish: 创建版本并发布，将可见范围限制为自己。
  openConsole: 打开飞书开发者后台 ↗
  capabilities: 工具与功能权限
  capabilitiesHint: 只勾选允许飞书会话调用的能力；修改后立即对新消息生效。
  selectedCount: 已启用 {count} 项
  workspace: 只读工作文件夹
  workspaceEmpty: 尚未选择；本地文件工具将不可用
  chooseFolder: 选择
  clearFolder: 清除
  selectFolderFailed: 无法选择工作文件夹
  maxToolRounds: 单次消息工具轮数上限
  maxToolRoundsHint: 可设置 2–20；越低限制越严格，复杂任务可能需要分多条消息完成。
  tools:
    utilities: 基础工具
    utilitiesHint: 计算、当前时间和 UUID 生成。
    webSearch: 联网搜索
    webSearchHint: 将查询词发送给已配置的搜索服务。
    workspaceRead: 本地文件读取
    workspaceReadHint: 仅可检查、查找和读取所选文件夹，不允许写入。
    skills: Skills
    skillsHint: 自动匹配已启用的 Skills，并读取其已登记参考文件。
    browser: 浏览器操作
    browserHint: 打开并操作公开网页；不允许安装浏览器、访问内网或保存截图。
    clipboard: 读取剪贴板
    clipboardHint: 允许读取这台电脑当前的纯文本剪贴板，可能包含敏感信息。
  safety: 飞书会话始终禁止写文件和运行脚本。浏览器与剪贴板权限具有较高风险，请只向可信飞书用户开放。
  save: 保存并连接
  saving: 正在保存…
  loadFailed: 无法读取远程机器人设置
  saveFailed: 无法保存远程机器人设置
  statusHint: 保存配置后显示连接状态。
  lastSender: 最近发送者 Open ID：{id}
  status:
    stopped: 未启用
    connecting: 正在连接
    connected: 已连接
    error: 连接异常
en:
  title: Remote access
  description: Chat with Lepus on this computer through a Feishu bot.
  enable: Enable remote bot
  enableHint: Keep a Feishu long connection while Lepus is running.
  onlyPlatform: The only supported platform in this version
  secretSaved: Saved securely; leave blank to keep it
  secretPlaceholder: Feishu app credential
  secretHint: The App Secret is encrypted with system secure storage and is never displayed.
  allowlist: Allowed Feishu user Open IDs
  allowlistHint: One per line. Empty allows everyone in the app visibility scope.
  setupTitle: Feishu setup
  setupCreate: Create a custom app and add the bot capability.
  setupPermission: Grant receive-message, app message-send, and basic user information permissions.
  setupEvent: Select long connection for event subscription and add
  setupPublish: Publish a version and limit visibility to yourself.
  openConsole: Open Feishu developer console ↗
  capabilities: Tools and capabilities
  capabilitiesHint: Only checked capabilities are available to Feishu chats. Changes apply to new messages immediately.
  selectedCount: '{count} enabled'
  workspace: Read-only workspace
  workspaceEmpty: Not selected; local file tools will be unavailable
  chooseFolder: Choose
  clearFolder: Clear
  selectFolderFailed: Failed to select a workspace folder
  maxToolRounds: Tool round limit per message
  maxToolRoundsHint: Set from 2–20. Lower limits are stricter; complex work may require more messages.
  tools:
    utilities: Utilities
    utilitiesHint: Calculator, current time, and UUID generation.
    webSearch: Web search
    webSearchHint: Sends search queries to the configured search provider.
    workspaceRead: Local file reading
    workspaceReadHint: Inspect, find, and read within the selected folder; writing stays disabled.
    skills: Skills
    skillsHint: Match enabled Skills and read their registered reference files.
    browser: Browser control
    browserHint: Open and operate public webpages; browser installation, private networks, and screenshots stay blocked.
    clipboard: Read clipboard
    clipboardHint: Read the computer's current plain-text clipboard, which may contain sensitive data.
  safety: Feishu chats always block file writes and scripts. Browser and clipboard access are high-risk; only allow trusted Feishu users.
  save: Save and connect
  saving: Saving…
  loadFailed: Failed to load remote bot settings
  saveFailed: Failed to save remote bot settings
  statusHint: Connection status appears after saving.
  lastSender: 'Last sender Open ID: {id}'
  status:
    stopped: Disabled
    connecting: Connecting
    connected: Connected
    error: Connection error
</i18n>
