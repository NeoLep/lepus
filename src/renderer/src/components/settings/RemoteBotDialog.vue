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
import { Bot, CircleAlert, LoaderCircle, Radio, X } from '@lucide/vue'
import type { RemoteBotSettings, RemoteBotStatus } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const { t } = useI18n({ useScope: 'local' })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const draft = ref<RemoteBotSettings>({
  enabled: false,
  platform: 'feishu',
  appId: '',
  appSecret: '',
  hasAppSecret: false,
  allowedOpenIds: []
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

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [settings, currentStatus] = await Promise.all([
      window.api.chat.queryRemoteBotSettings(),
      window.api.chat.queryRemoteBotStatus()
    ])
    draft.value = { ...settings, appSecret: '', allowedOpenIds: [...settings.allowedOpenIds] }
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
      ...draft.value,
      appId: draft.value.appId.trim(),
      appSecret: draft.value.appSecret.trim(),
      allowedOpenIds: allowedOpenIdsText.value
        .split(/[\n,，]/)
        .map((id) => id.trim())
        .filter(Boolean)
    })
    draft.value = { ...saved, appSecret: '', allowedOpenIds: [...saved.allowedOpenIds] }
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
  safety: 远程会话默认只开放只读工具；需要审批、写文件、运行脚本或操作浏览器时，请回到桌面端完成。
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
  safety: Remote chats use read-only tools. Return to the desktop app for approvals, writes, scripts, or browser actions.
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
