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
import { Check, Eye, EyeOff, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { SearchProviderConfig, SearchProviderId } from '@ipc/chat/constants'
import SearchProviderLogo from './SearchProviderLogo.vue'

const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n({ useScope: 'local' })
const configs = ref<SearchProviderConfig[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const visibleKeys = ref(new Set<SearchProviderId>())

const providerMetadata: Record<
  SearchProviderId,
  { name: string; descriptionKey: string; keyPlaceholder: string }
> = {
  brave: { name: 'Brave Search', descriptionKey: 'providers.brave', keyPlaceholder: 'BSA...' },
  tavily: { name: 'Tavily', descriptionKey: 'providers.tavily', keyPlaceholder: 'tvly-...' },
  exa: { name: 'Exa', descriptionKey: 'providers.exa', keyPlaceholder: 'exa-...' },
  perplexity: {
    name: 'Perplexity',
    descriptionKey: 'providers.perplexity',
    keyPlaceholder: 'pplx-...'
  },
  firecrawl: {
    name: 'Firecrawl',
    descriptionKey: 'providers.firecrawl',
    keyPlaceholder: 'fc-...'
  },
  searxng: { name: 'SearXNG', descriptionKey: 'providers.searxng', keyPlaceholder: '' }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  visibleKeys.value = new Set()
  try {
    configs.value = await window.api.chat.querySearchProviderConfigs()
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

function toggleKey(provider: SearchProviderId): void {
  const next = new Set(visibleKeys.value)
  if (next.has(provider)) next.delete(provider)
  else next.add(provider)
  visibleKeys.value = next
}

function validate(): boolean {
  for (const config of configs.value) {
    config.apiKey = config.apiKey.trim()
    config.baseURL = config.baseURL.trim().replace(/\/+$/, '')
    if (!config.enabled) continue
    if (config.provider !== 'searxng' && !config.apiKey && !config.hasApiKey) {
      error.value = t('apiKeyRequired', { name: providerMetadata[config.provider].name })
      return false
    }
    if (config.provider === 'searxng') {
      try {
        const url = new URL(config.baseURL)
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
      } catch {
        error.value = t('urlRequired')
        return false
      }
    }
  }
  return true
}

async function save(): Promise<void> {
  if (saving.value || !validate()) return
  saving.value = true
  error.value = ''
  try {
    configs.value = await window.api.chat.updateSearchProviderConfigs(
      configs.value.map((config) => ({ ...config }))
    )
    emit('saved')
    if (!props.embedded) open.value = false
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : t('saveFailed')
  } finally {
    saving.value = false
  }
}

watch(
  open,
  (isOpen) => {
    if (isOpen) void load()
  },
  { immediate: true }
)
</script>

<template>
  <DialogRoot v-model:open="open" :modal="!props.embedded">
    <DialogPortal :disabled="props.embedded">
      <DialogOverlay v-if="!props.embedded" class="search-dialog-overlay" />
      <DialogContent
        class="search-dialog-content"
        :class="{ embedded: props.embedded }"
        @open-auto-focus.prevent
      >
        <header class="dialog-header">
          <div>
            <DialogTitle class="dialog-title">{{ t('title') }}</DialogTitle>
            <DialogDescription class="dialog-description">
              {{ t('description') }}
            </DialogDescription>
          </div>
          <DialogClose v-if="!props.embedded" class="dialog-close" :aria-label="t('common.close')">
            <X :size="18" />
          </DialogClose>
        </header>

        <div class="provider-grid" :class="{ loading }">
          <article
            v-for="config in configs"
            :key="config.provider"
            class="provider-card"
            :class="{ enabled: config.enabled }"
          >
            <div class="provider-heading">
              <div class="provider-icon" :class="`provider-${config.provider}`">
                <SearchProviderLogo :provider="config.provider" />
              </div>
              <div>
                <strong>{{ providerMetadata[config.provider].name }}</strong>
                <p>{{ t(providerMetadata[config.provider].descriptionKey) }}</p>
              </div>
              <label class="enable-control">
                <input v-model="config.enabled" type="checkbox" />
                <span><Check v-if="config.enabled" :size="13" /></span>
                <small>{{ config.enabled ? t('enabled') : t('disabled') }}</small>
              </label>
            </div>

            <label v-if="config.provider === 'searxng'" class="credential-field">
              <span>{{ t('instanceUrl') }}</span>
              <input
                v-model="config.baseURL"
                type="url"
                autocomplete="off"
                placeholder="https://search.example.com"
              />
            </label>
            <label v-else class="credential-field">
              <span>API Key</span>
              <div class="secret-input">
                <input
                  v-model="config.apiKey"
                  :type="visibleKeys.has(config.provider) ? 'text' : 'password'"
                  autocomplete="new-password"
                  :placeholder="
                    config.hasApiKey
                      ? t('apiKeyStored')
                      : providerMetadata[config.provider].keyPlaceholder
                  "
                />
                <button
                  type="button"
                  :aria-label="t('toggleApiKey')"
                  @click="toggleKey(config.provider)"
                >
                  <EyeOff v-if="visibleKeys.has(config.provider)" :size="16" />
                  <Eye v-else :size="16" />
                </button>
              </div>
              <small v-if="config.hasApiKey && !config.apiKey" class="stored-secret-note">
                {{ t('apiKeyStoredHelp') }}
              </small>
            </label>
          </article>
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>
        <footer class="dialog-actions">
          <small>{{ t('securityNote') }}</small>
          <span></span>
          <DialogClose v-if="!props.embedded" class="secondary-button" :disabled="saving">
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
.search-dialog-overlay {
  position: fixed;
  z-index: 92;
  inset: 0;
  background: var(--app-dialog-overlay);
}

.search-dialog-content {
  position: fixed;
  z-index: 93;
  top: 50%;
  left: 50%;
  display: flex;
  width: min(900px, calc(100vw - 40px));
  max-height: min(740px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 16px;
  outline: none;
  background: var(--app-surface);
  box-shadow: 0 24px 70px rgb(16 24 40 / 24%);
  transform: translate(-50%, -50%);
}

.search-dialog-content.embedded {
  position: relative;
  z-index: auto;
  top: auto;
  left: auto;
  align-self: stretch;
  width: 100%;
  max-width: 100%;
  height: 100%;
  max-height: none;
  flex: 1 1 auto;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transform: none;
}

.dialog-header,
.dialog-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 22px;
}

.dialog-header {
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid var(--app-border-subtle);
}

.dialog-title {
  margin: 0;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 650;
}
.dialog-description {
  margin: 5px 0 0;
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
.dialog-close:hover {
  background: var(--app-surface-muted);
}

.provider-grid {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  align-content: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 18px 22px;
  overflow-y: auto;
}
.provider-grid.loading {
  opacity: 0.55;
  pointer-events: none;
}
.provider-card {
  padding: 15px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
}
.provider-card.enabled {
  border-color: var(--app-text-muted);
  box-shadow: 0 0 0 2px rgb(152 162 179 / 12%);
}
.provider-heading {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
}
.provider-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  background: var(--app-surface-muted);
  color: var(--app-text-secondary);
}
.provider-brave {
  background: #fff1eb;
  color: #fb542b;
}
.provider-tavily {
  background: #eef4ff;
  color: #4f46e5;
}
.provider-exa {
  background: var(--app-surface-muted);
  color: var(--app-text);
}
.provider-perplexity {
  background: #e8f7f7;
  color: #20808d;
}
.provider-firecrawl {
  background: #fff3e8;
  color: #f97316;
}
.provider-searxng {
  background: #edf2ff;
  color: #3050ff;
}
.provider-heading strong {
  color: var(--app-text);
  font-size: 13px;
}
.provider-heading p {
  margin: 4px 0 0;
  color: var(--app-text-tertiary);
  font-size: 11px;
  line-height: 1.45;
}
.enable-control {
  display: grid;
  grid-template-columns: 22px auto;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.enable-control input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.enable-control > span {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid var(--app-border-strong);
  border-radius: 6px;
  color: white;
}
.enable-control input:checked + span {
  border-color: var(--app-text);
  background: var(--app-inverse-bg);
}
.enable-control small {
  color: var(--app-text-tertiary);
  font-size: 10px;
}
.credential-field {
  display: block;
  margin-top: 13px;
}
.credential-field > span {
  display: block;
  margin-bottom: 5px;
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 600;
}
.credential-field input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  outline: none;
  font: inherit;
  font-size: 12px;
}
.credential-field input:focus {
  border-color: #7f8a9b;
  box-shadow: 0 0 0 3px rgb(152 162 179 / 16%);
}
.secret-input {
  position: relative;
}
.secret-input input {
  padding-right: 39px;
}
.secret-input button {
  position: absolute;
  top: 2px;
  right: 3px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
}
.secret-input button:hover {
  background: var(--app-surface-muted);
}
.stored-secret-note {
  display: block;
  margin-top: 5px;
  color: var(--app-text-tertiary);
  font-size: 10px;
}
.form-error {
  margin: 0 22px 4px;
  color: var(--app-danger);
  font-size: 12px;
}
.dialog-actions {
  padding: 13px 22px;
  border-top: 1px solid var(--app-border-subtle);
}
.dialog-actions > small {
  color: var(--app-text-muted);
  font-size: 10px;
}
.dialog-actions > span {
  flex: 1;
}
.primary-button,
.secondary-button {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.primary-button {
  border: 1px solid var(--app-inverse-bg);
  background: var(--app-inverse-bg);
  color: var(--app-agent-card-bg);
}
.secondary-button {
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-secondary);
}

@media (max-width: 720px) {
  .provider-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 互联网搜索
  description: 选择并配置要提供给 AI 的搜索服务，可同时启用多个。
  enabled: 已启用
  disabled: 未启用
  instanceUrl: 实例 URL
  toggleApiKey: 显示或隐藏 API Key
  securityNote: API Key 由系统密钥链加密，仅由主进程发送给对应搜索服务。
  apiKeyStored: 已安全保存，输入新 Key 可替换
  apiKeyStoredHelp: 留空将保留现有的加密 Key。
  apiKeyRequired: 启用 {name} 前需要填写 API Key
  urlRequired: 启用 SearXNG 前需要填写有效的 HTTP(S) 实例地址
  loadFailed: 加载搜索配置失败
  saveFailed: 保存搜索配置失败
  saving: 保存中…
  save: 保存配置
  providers:
    brave: 独立网页索引，适合低延迟的通用实时搜索。
    tavily: 面向 AI Agent 的搜索与内容摘要。
    exa: 语义检索，适合研究资料和相似内容发现。
    perplexity: 实时排序结果，支持较丰富的检索元数据。
    firecrawl: 搜索与网页内容抽取结合，适合后续深度阅读。
    searxng: 开源元搜索引擎，适合自托管和隐私优先场景。
en:
  title: Web search
  description: Choose and configure search providers available to the AI. Multiple providers can be enabled.
  enabled: Enabled
  disabled: Disabled
  instanceUrl: Instance URL
  toggleApiKey: Show or hide API Key
  securityNote: API keys are encrypted with the system keychain and sent only by the main process to the selected provider.
  apiKeyStored: Securely stored; enter a new key to replace it
  apiKeyStoredHelp: Leave empty to keep the existing encrypted key.
  apiKeyRequired: Enter an API Key before enabling {name}
  urlRequired: Enter a valid HTTP(S) instance URL before enabling SearXNG
  loadFailed: Failed to load search settings
  saveFailed: Failed to save search settings
  saving: Saving…
  save: Save settings
  providers:
    brave: Independent web index for fast, general-purpose real-time search.
    tavily: Search and content summaries designed for AI agents.
    exa: Semantic retrieval for research and similar-content discovery.
    perplexity: Real-time ranked results with rich search metadata.
    firecrawl: Search plus content extraction for deeper page reading.
    searxng: Open-source metasearch for self-hosting and privacy-first use.
</i18n>
