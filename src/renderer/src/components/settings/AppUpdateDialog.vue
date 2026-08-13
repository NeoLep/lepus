<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  CheckCircle2,
  Download,
  ExternalLink,
  GitFork,
  RefreshCw,
  RotateCw,
  TriangleAlert
} from '@lucide/vue'
import type { UpdateState } from '@ipc/update/constants'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n({ useScope: 'local' })
const state = ref<UpdateState>({ status: 'idle', currentVersion: '' })
const busy = computed(() => ['checking', 'downloading'].includes(state.value.status))
const progress = computed(() => Math.max(0, Math.min(100, state.value.percent ?? 0)))

const statusText = computed(() => {
  const key = state.value.status.replace('-', '')
  return t(`status.${key}`)
})

function formatBytes(value?: number): string {
  if (!value || value < 1) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDate(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
        date
      )
}

async function check(): Promise<void> {
  state.value = await window.api.update.check()
}

async function download(): Promise<void> {
  state.value = await window.api.update.download()
}

async function install(): Promise<void> {
  if (!window.confirm(t('installConfirm'))) return
  await window.api.update.install()
}

const removeListener = window.api.update.onStateChanged((nextState) => {
  state.value = nextState
})

onMounted(async () => {
  state.value = await window.api.update.queryState()
})
onBeforeUnmount(removeListener)
</script>

<template>
  <div class="update-page">
    <header class="update-header">
      <div>
        <h2>{{ t('title') }}</h2>
        <p>{{ t('description') }}</p>
      </div>
      <a
        class="github-link"
        href="https://github.com/NeoLep/lepus"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="t('openGithub')"
      >
        <GitFork :size="16" />
        <span>{{ t('githubProject') }}</span>
        <ExternalLink :size="13" />
      </a>
    </header>

    <div class="update-body">
      <section class="version-card">
        <div class="version-copy">
          <span>{{ t('currentVersion') }}</span>
          <strong>v{{ state.currentVersion || '—' }}</strong>
        </div>
        <button class="primary-button" type="button" :disabled="busy" @click="check">
          <RefreshCw :size="16" :class="{ spinning: state.status === 'checking' }" />
          {{ state.status === 'checking' ? t('checking') : t('check') }}
        </button>
      </section>

      <section v-if="state.status !== 'idle'" class="status-card" :class="state.status">
        <div class="status-heading">
          <CheckCircle2
            v-if="state.status === 'not-available' || state.status === 'downloaded'"
            :size="20"
          />
          <TriangleAlert
            v-else-if="state.status === 'error' || state.status === 'unsupported'"
            :size="20"
          />
          <Download
            v-else-if="state.status === 'available' || state.status === 'downloading'"
            :size="20"
          />
          <RefreshCw v-else :size="20" class="spinning" />
          <div>
            <strong>{{ statusText }}</strong>
            <p v-if="state.availableVersion">
              {{ t('availableVersion', { version: state.availableVersion }) }}
              <span v-if="state.releaseDate"> · {{ formatDate(state.releaseDate) }}</span>
            </p>
          </div>
        </div>

        <div v-if="state.status === 'downloading'" class="download-progress">
          <div class="progress-track"><span :style="{ width: `${progress}%` }"></span></div>
          <div class="progress-meta">
            <span>{{ progress.toFixed(1) }}%</span>
            <span>
              {{ formatBytes(state.transferred) }} / {{ formatBytes(state.total) }}
              <template v-if="state.bytesPerSecond">
                · {{ formatBytes(state.bytesPerSecond) }}/s</template
              >
            </span>
          </div>
        </div>

        <p v-if="state.error" class="error-message">{{ state.error }}</p>

        <div v-if="state.status === 'available'" class="status-actions">
          <button class="primary-button" type="button" @click="download">
            <Download :size="16" />{{ t('download') }}
          </button>
        </div>
        <div v-else-if="state.status === 'downloaded'" class="status-actions">
          <button class="primary-button" type="button" @click="install">
            <RotateCw :size="16" />{{ t('restartInstall') }}
          </button>
        </div>
        <div v-else-if="state.status === 'error'" class="status-actions">
          <button class="secondary-button" type="button" @click="check">
            <RefreshCw :size="16" />{{ t('retry') }}
          </button>
        </div>
      </section>

      <section v-if="state.releaseNotes" class="release-notes">
        <h3>{{ state.releaseName || t('releaseNotes') }}</h3>
        <div>{{ state.releaseNotes }}</div>
      </section>

      <p class="update-hint">{{ t('hint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.update-page {
  width: 100%;
  min-height: 0;
  overflow-y: auto;
  color: var(--app-text-secondary);
}
.update-header {
  display: flex;
  min-height: 72px;
  box-sizing: border-box;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 22px 15px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.update-header h2 {
  margin: 0;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}
.update-header p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.45;
}
.github-link {
  display: inline-flex;
  min-height: 34px;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid var(--app-border-strong);
  border-radius: 9px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}
.github-link:hover {
  background: var(--app-hover);
  color: var(--app-text);
}
.github-link:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.update-body {
  display: grid;
  gap: 14px;
  padding: 22px;
}
.version-card,
.status-card,
.release-notes {
  border: 1px solid var(--app-border-subtle);
  border-radius: 12px;
  background: var(--app-surface-subtle);
  padding: 16px;
}
.version-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.version-copy {
  display: grid;
  gap: 3px;
}
.version-copy span {
  color: var(--app-text-muted);
  font-size: 12px;
}
.version-copy strong {
  color: var(--app-text);
  font-size: 22px;
}
.primary-button,
.secondary-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.primary-button {
  border: 1px solid var(--app-accent);
  background: var(--app-accent);
  color: white;
}
.secondary-button {
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-secondary);
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.status-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--app-accent);
}
.status-heading strong {
  color: var(--app-text);
  font-size: 14px;
}
.status-heading p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}
.status-card.error .status-heading,
.status-card.unsupported .status-heading {
  color: #d92d20;
}
.download-progress {
  margin-top: 16px;
}
.progress-track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--app-border-subtle);
}
.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--app-accent);
  transition: width 150ms ease;
}
.progress-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 7px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.error-message {
  margin: 12px 0 0;
  color: #d92d20;
  font-size: 12px;
  line-height: 1.5;
}
.status-actions {
  margin-top: 15px;
}
.release-notes h3 {
  margin: 0 0 10px;
  color: var(--app-text);
  font-size: 14px;
}
.release-notes div {
  max-height: 230px;
  overflow-y: auto;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
}
.update-hint {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1.5;
}
.spinning {
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
  title: 应用更新
  description: 从 GitHub Releases 检查、下载并安装 Lepus 新版本。
  currentVersion: 当前版本
  githubProject: GitHub 项目
  openGithub: 在浏览器中打开 Lepus GitHub 项目主页
  check: 检查更新
  checking: 正在检查…
  availableVersion: 发现新版本 v{version}
  download: 下载更新
  restartInstall: 重启并安装
  retry: 重试
  releaseNotes: 版本说明
  installConfirm: 安装更新会关闭 Lepus。确认现在重启并安装吗？
  hint: 更新包由 GitHub Releases 提供，并在安装前使用发布元数据中的 SHA-512 校验值验证。
  status:
    idle: 尚未检查
    checking: 正在连接 GitHub Releases…
    available: 有可用更新
    notavailable: 当前已是最新版本
    downloading: 正在下载更新
    downloaded: 更新已准备就绪
    error: 更新失败
    unsupported: 当前环境不支持应用内更新
en:
  title: App updates
  description: Check, download, and install new Lepus versions from GitHub Releases.
  currentVersion: Current version
  githubProject: GitHub project
  openGithub: Open the Lepus GitHub project page in your browser
  check: Check for updates
  checking: Checking…
  availableVersion: Version v{version} is available
  download: Download update
  restartInstall: Restart and install
  retry: Retry
  releaseNotes: Release notes
  installConfirm: Installing the update will close Lepus. Restart and install now?
  hint: Update packages come from GitHub Releases and are verified against the SHA-512 checksum in the release metadata before installation.
  status:
    idle: Not checked yet
    checking: Connecting to GitHub Releases…
    available: An update is available
    notavailable: Lepus is up to date
    downloading: Downloading update
    downloaded: Update is ready to install
    error: Update failed
    unsupported: In-app updates are not supported in this environment
</i18n>
