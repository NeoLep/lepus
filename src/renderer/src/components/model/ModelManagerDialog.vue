<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport
} from 'reka-ui'
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Trash2,
  WalletCards,
  X
} from '@lucide/vue'
import type { ModelConfig, ProviderBalance, ProviderBalanceProvider } from '@ipc/chat/constants'
import {
  createCompressionPolicy,
  detectModelContextWindow
} from '@/shared/agent/history-compression'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  configs: ModelConfig[]
  activeId: string | null
  error: string
  embedded?: boolean
  saveConfig: (config: ModelConfig) => Promise<boolean>
  deleteConfig: (id: string) => Promise<boolean>
  selectConfig: (id: string) => Promise<boolean>
}>()

const open = defineModel<boolean>('open', { required: true })
const selectedId = ref<string | null>(null)
const draft = ref<ModelConfig>(makeConfig())
const saving = ref(false)
const localError = ref('')
const showApiKey = ref(false)
const balance = ref<ProviderBalance | null>(null)
const balanceLoading = ref(false)
const balanceError = ref('')
const selectedBaseUrlPreset = ref('custom')
const { t } = useI18n({ useScope: 'local' })

const baseUrlPresets = [
  { id: 'deepseek', label: 'DeepSeek', url: 'https://api.deepseek.com' },
  { id: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { id: 'kimi', label: 'Kimi', url: 'https://api.moonshot.cn/v1' },
  { id: 'siliconflow', label: '硅基流动', url: 'https://api.siliconflow.cn/v1' },
  { id: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  {
    id: 'qwen',
    label: '通义千问（阿里云百炼）',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  }
] as const

const isExisting = computed(() => props.configs.some((config) => config.id === draft.value.id))
const savedConfig = computed(() => props.configs.find((config) => config.id === draft.value.id))
const balanceProvider = computed<ProviderBalanceProvider | null>(() => {
  const baseURL = savedConfig.value?.baseURL
  if (!baseURL) return null
  try {
    const url = new URL(baseURL)
    if (
      url.protocol !== 'https:' ||
      (url.port && url.port !== '443') ||
      url.username ||
      url.password
    )
      return null
    if (url.hostname === 'api.deepseek.com') return 'deepseek'
    if (url.hostname === 'api.moonshot.cn') return 'kimi'
    if (url.hostname === 'api.siliconflow.cn') return 'siliconflow'
    if (url.hostname === 'openrouter.ai') return 'openrouter'
    return null
  } catch {
    return null
  }
})
const tokenPolicy = computed(() =>
  createCompressionPolicy({
    ...draft.value,
    detectedContextWindow: detectModelContextWindow(draft.value.model)
  })
)
const contextSourceText = computed(() => {
  return t(`contextSource.${tokenPolicy.value.contextWindowSource}`)
})

function makeConfig(): ModelConfig {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: '',
    baseURL: '',
    model: '',
    apiKey: '',
    hasApiKey: false,
    contextWindowOverride: null,
    detectedContextWindow: null,
    maxOutputTokensOverride: null,
    tokenEstimateRatio: 1,
    isActive: false,
    createdAt: now,
    updatedAt: now
  }
}

function editConfig(config: ModelConfig): void {
  selectedId.value = config.id
  draft.value = { ...config, apiKey: '' }
  localError.value = ''
  showApiKey.value = false
  balance.value = null
  balanceError.value = ''
  const normalized = config.baseURL.trim().replace(/\/+$/, '')
  selectedBaseUrlPreset.value =
    baseUrlPresets.find((preset) => preset.url === normalized)?.id ?? 'custom'
}

function createConfig(): void {
  selectedId.value = null
  draft.value = makeConfig()
  localError.value = ''
  showApiKey.value = false
  balance.value = null
  balanceError.value = ''
  selectedBaseUrlPreset.value = 'custom'
}

function applyBaseUrlPreset(): void {
  if (selectedBaseUrlPreset.value === 'custom') return
  const preset = baseUrlPresets.find((item) => item.id === selectedBaseUrlPreset.value)
  if (preset) draft.value.baseURL = preset.url
}

function baseUrlPresetLabel(): string {
  if (selectedBaseUrlPreset.value === 'custom') return t('customProvider')
  return (
    baseUrlPresets.find((preset) => preset.id === selectedBaseUrlPreset.value)?.label ??
    t('customProvider')
  )
}

function markBaseUrlCustom(): void {
  const normalized = draft.value.baseURL.trim().replace(/\/+$/, '')
  selectedBaseUrlPreset.value =
    baseUrlPresets.find((preset) => preset.url === normalized)?.id ?? 'custom'
}

function formatBalance(value: string, currency: 'CNY' | 'USD'): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return `${value} ${currency}`
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(amount)
}

function formatBalanceTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' }).format(date)
}

async function refreshBalance(): Promise<void> {
  if (!balanceProvider.value || balanceLoading.value) return
  balanceLoading.value = true
  balanceError.value = ''
  try {
    balance.value = await window.api.chat.queryProviderBalance(draft.value.id)
  } catch (error) {
    balanceError.value = error instanceof Error ? error.message : t('balance.queryFailed')
  } finally {
    balanceLoading.value = false
  }
}

function validate(): boolean {
  const config = draft.value
  config.name = config.name.trim()
  config.baseURL = config.baseURL.trim().replace(/\/+$/, '')
  config.model = config.model.trim()
  config.apiKey = config.apiKey.trim()
  config.contextWindowOverride = config.contextWindowOverride
    ? Math.round(Number(config.contextWindowOverride))
    : null
  config.maxOutputTokensOverride = config.maxOutputTokensOverride
    ? Math.round(Number(config.maxOutputTokensOverride))
    : null

  if (!config.name || !config.baseURL || !config.model || (!config.apiKey && !config.hasApiKey)) {
    localError.value = t('validation.required')
    return false
  }
  try {
    const url = new URL(config.baseURL)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
  } catch {
    localError.value = t('validation.invalidBaseUrl')
    return false
  }
  if (config.contextWindowOverride !== null && config.contextWindowOverride < 2_048) {
    localError.value = t('validation.contextMinimum')
    return false
  }
  if (config.maxOutputTokensOverride !== null && config.maxOutputTokensOverride < 256) {
    localError.value = t('validation.outputMinimum')
    return false
  }
  const effectiveContext = config.contextWindowOverride ?? tokenPolicy.value.contextWindow
  if (
    config.maxOutputTokensOverride !== null &&
    config.maxOutputTokensOverride >= effectiveContext
  ) {
    localError.value = t('validation.outputLessThanContext')
    return false
  }
  return true
}

async function save(): Promise<void> {
  if (!validate() || saving.value) return
  saving.value = true
  localError.value = ''
  const config = { ...draft.value, updatedAt: new Date().toISOString() }
  const saved = await props.saveConfig(config)
  saving.value = false
  if (saved) {
    selectedId.value = config.id
    draft.value = { ...config, apiKey: '', hasApiKey: true }
  }
}

async function remove(): Promise<void> {
  if (!isExisting.value || saving.value) return
  if (!window.confirm(t('deleteConfirm', { name: draft.value.name }))) return
  saving.value = true
  const removed = await props.deleteConfig(draft.value.id)
  saving.value = false
  if (removed) createConfig()
}

async function selectCurrent(): Promise<void> {
  if (!isExisting.value || draft.value.isActive || saving.value) return
  saving.value = true
  const selected = await props.selectConfig(draft.value.id)
  saving.value = false
  if (selected) draft.value.isActive = true
}

watch(
  () => open.value,
  (isOpen) => {
    if (!isOpen) return
    const initial =
      props.configs.find((config) => config.id === props.activeId) ?? props.configs[0] ?? null
    if (initial) editConfig(initial)
    else createConfig()
  }
)

watch(
  () => props.configs,
  (configs) => {
    const selected = configs.find((config) => config.id === selectedId.value)
    if (selected) draft.value = { ...selected }
  },
  { deep: true }
)
</script>

<template>
  <DialogRoot v-model:open="open" :modal="!props.embedded">
    <DialogPortal :disabled="props.embedded">
      <DialogOverlay v-if="!props.embedded" class="model-dialog-overlay" />
      <DialogContent
        class="model-dialog-content"
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

        <div class="dialog-body">
          <aside class="config-list">
            <button class="new-config-button" type="button" @click="createConfig">
              <Plus :size="16" />
              {{ t('newConfig') }}
            </button>
            <div class="config-items">
              <button
                v-for="config in configs"
                :key="config.id"
                class="config-item"
                :class="{ selected: config.id === selectedId }"
                type="button"
                @click="editConfig(config)"
              >
                <span>
                  <strong>{{ config.name }}</strong>
                  <small>{{ config.model }}</small>
                </span>
                <Check v-if="config.isActive" :size="15" />
              </button>
            </div>
          </aside>

          <form class="config-form" @submit.prevent="save">
            <label>
              <span>{{ t('configName') }}</span>
              <input
                v-model="draft.name"
                autocomplete="off"
                :placeholder="t('configNameExample')"
              />
            </label>

            <section v-if="balanceProvider" class="balance-card">
              <div class="balance-card-header">
                <span class="balance-icon"><WalletCards :size="17" /></span>
                <div>
                  <strong>{{
                    t('balance.title', { provider: t(`balance.providers.${balanceProvider}`) })
                  }}</strong>
                  <small v-if="balance">{{
                    t('balance.updatedAt', { time: formatBalanceTime(balance.queriedAt) })
                  }}</small>
                  <small v-else>{{ t('balance.description') }}</small>
                </div>
                <button type="button" :disabled="balanceLoading" @click="refreshBalance">
                  <RefreshCw :size="14" :class="{ spinning: balanceLoading }" />
                  {{ balanceLoading ? t('balance.querying') : t('balance.refresh') }}
                </button>
              </div>
              <div v-if="balance" class="balance-list">
                <div v-for="item in balance.balances" :key="item.currency" class="balance-row">
                  <div>
                    <span>{{ t('balance.available') }}</span>
                    <strong>{{ formatBalance(item.totalBalance, item.currency) }}</strong>
                  </div>
                  <dl>
                    <div v-if="balance.provider !== 'openrouter'">
                      <dt>{{ t('balance.toppedUp') }}</dt>
                      <dd>{{ formatBalance(item.toppedUpBalance, item.currency) }}</dd>
                    </div>
                    <div v-if="balance.provider !== 'openrouter'">
                      <dt>{{ t('balance.granted') }}</dt>
                      <dd>{{ formatBalance(item.grantedBalance, item.currency) }}</dd>
                    </div>
                  </dl>
                </div>
                <p class="balance-status" :class="{ unavailable: !balance.isAvailable }">
                  {{ balance.isAvailable ? t('balance.usable') : t('balance.unusable') }}
                </p>
              </div>
              <p v-if="balanceError" class="balance-error">{{ balanceError }}</p>
            </section>
            <label class="base-url-field">
              <span>{{ t('baseUrl') }}</span>
              <SelectRoot v-model="selectedBaseUrlPreset" @update:model-value="applyBaseUrlPreset">
                <SelectTrigger class="provider-select-trigger" :aria-label="t('providerPreset')">
                  <SelectValue>{{ baseUrlPresetLabel() }}</SelectValue>
                  <ChevronDown :size="15" />
                </SelectTrigger>
                <SelectPortal>
                  <SelectContent
                    class="provider-select-content"
                    position="popper"
                    :side-offset="5"
                    :style="{ zIndex: 1000 }"
                  >
                    <SelectViewport class="provider-select-viewport">
                      <SelectItem
                        v-for="preset in baseUrlPresets"
                        :key="preset.id"
                        class="provider-select-item"
                        :value="preset.id"
                      >
                        <SelectItemIndicator class="provider-select-indicator">
                          <Check :size="14" />
                        </SelectItemIndicator>
                        <SelectItemText>{{ preset.label }}</SelectItemText>
                      </SelectItem>
                      <SelectItem class="provider-select-item" value="custom">
                        <SelectItemIndicator class="provider-select-indicator">
                          <Check :size="14" />
                        </SelectItemIndicator>
                        <SelectItemText>{{ t('customProvider') }}</SelectItemText>
                      </SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </SelectPortal>
              </SelectRoot>
              <input
                v-model="draft.baseURL"
                type="url"
                autocomplete="off"
                placeholder="https://api.example.com/v1"
                @input="markBaseUrlCustom"
              />
              <small>{{ t('baseUrlHelp') }}</small>
            </label>
            <label>
              <span>{{ t('modelName') }}</span>
              <input
                v-model="draft.model"
                autocomplete="off"
                :placeholder="t('modelNameExample')"
              />
            </label>
            <label>
              <span>API Key</span>
              <div class="secret-input">
                <input
                  v-model="draft.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  autocomplete="new-password"
                  :placeholder="draft.hasApiKey ? t('apiKeyStored') : 'sk-...'"
                />
                <button
                  type="button"
                  :aria-label="showApiKey ? t('hideApiKey') : t('showApiKey')"
                  @click="showApiKey = !showApiKey"
                >
                  <EyeOff v-if="showApiKey" :size="16" />
                  <Eye v-else :size="16" />
                </button>
              </div>
              <small v-if="draft.hasApiKey && !draft.apiKey" class="stored-secret-note">
                {{ t('apiKeyStoredHelp') }}
              </small>
            </label>

            <details class="advanced-settings">
              <summary>{{ t('advancedTokenSettings') }}</summary>
              <p class="context-detection">
                {{ contextSourceText }}：{{ tokenPolicy.contextWindow.toLocaleString() }} Token
              </p>
              <div class="advanced-fields">
                <label>
                  <span>{{ t('contextWindowOptional') }}</span>
                  <input
                    v-model.number="draft.contextWindowOverride"
                    type="number"
                    min="2048"
                    step="1024"
                    :placeholder="t('autoDetect')"
                  />
                  <small>{{ t('contextWindowHelp') }}</small>
                </label>
                <label>
                  <span>{{ t('maxOutputOptional') }}</span>
                  <input
                    v-model.number="draft.maxOutputTokensOverride"
                    type="number"
                    min="256"
                    step="256"
                    :placeholder="t('autoReserve')"
                  />
                  <small>{{ t('maxOutputHelp') }}</small>
                </label>
              </div>
            </details>

            <p v-if="localError || error" class="form-error">{{ localError || error }}</p>

            <footer class="form-actions">
              <button
                v-if="isExisting"
                class="delete-config-button"
                type="button"
                :disabled="saving"
                @click="remove"
              >
                <Trash2 :size="15" />
                {{ t('common.delete') }}
              </button>
              <span class="action-spacer"></span>
              <button
                v-if="isExisting && !draft.isActive"
                class="secondary-button"
                type="button"
                :disabled="saving"
                @click="selectCurrent"
              >
                {{ t('setCurrent') }}
              </button>
              <span v-else-if="draft.isActive" class="active-label"
                ><Check :size="14" /> {{ t('currentConfig') }}</span
              >
              <button class="primary-button" type="submit" :disabled="saving">
                {{ saving ? t('saving') : t('saveConfig') }}
              </button>
            </footer>
          </form>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.model-dialog-overlay {
  position: fixed;
  z-index: 80;
  inset: 0;
  background: var(--app-dialog-overlay);
  animation: overlay-in 140ms ease-out;
}

.model-dialog-content {
  position: fixed;
  z-index: 81;
  top: 50%;
  left: 50%;
  display: flex;
  width: min(760px, calc(100vw - 40px));
  height: min(560px, calc(100vh - 60px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 16px;
  outline: none;
  background: var(--app-surface);
  box-shadow: 0 24px 70px rgb(16 24 40 / 24%);
  transform: translate(-50%, -50%);
  animation: dialog-in 160ms ease-out;
}

.model-dialog-content.embedded {
  position: relative;
  z-index: auto;
  top: auto;
  left: auto;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transform: none;
  animation: none;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 22px 17px;
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

.dialog-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 220px 1fr;
}

.config-list {
  min-height: 0;
  padding: 12px;
  border-right: 1px solid var(--app-border-subtle);
  background: var(--app-surface-subtle);
}

.new-config-button,
.config-item {
  display: flex;
  width: 100%;
  align-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary);
  text-align: left;
  cursor: pointer;
}

.new-config-button {
  height: 36px;
  gap: 8px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 600;
}

.new-config-button:hover,
.config-item:hover {
  background: var(--app-surface-muted);
}

.config-items {
  max-height: calc(100% - 44px);
  margin-top: 8px;
  overflow-y: auto;
}

.config-item {
  min-height: 48px;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 2px;
  padding: 7px 10px;
}

.config-item.selected {
  background: var(--app-active);
  color: var(--app-text);
}

.config-item > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.config-item strong,
.config-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-item strong {
  font-size: 13px;
  font-weight: 600;
}

.config-item small {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.config-form {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 15px;
  padding: 20px 22px;
  overflow-y: auto;
}

.config-form label > span {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.config-form input,
.provider-select-trigger {
  width: 100%;
  height: 38px;
  padding: 0 11px;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  outline: none;
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
}

.config-form input:focus,
.provider-select-trigger:focus-visible {
  border-color: #7f8a9b;
  box-shadow: 0 0 0 3px rgb(152 162 179 / 16%);
}

.base-url-field {
  display: grid;
  gap: 7px;
}

.base-url-field > span {
  margin-bottom: -1px !important;
}

.base-url-field > small {
  color: var(--app-text-muted);
  font-size: 10px;
  line-height: 1.4;
}

.provider-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  cursor: pointer;
}

:global(.provider-select-content) {
  z-index: 1000 !important;
  min-width: var(--reka-select-trigger-width);
  max-height: min(320px, var(--reka-select-content-available-height));
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 9px;
  background: var(--app-surface);
  box-shadow: 0 12px 30px rgb(16 24 40 / 16%);
  color: var(--app-text-secondary);
}

:global(.provider-select-viewport) {
  padding: 5px;
}

:global(.provider-select-item) {
  position: relative;
  display: flex;
  min-height: 34px;
  align-items: center;
  padding: 7px 9px 7px 31px;
  border-radius: 7px;
  outline: none;
  font-size: 13px;
  cursor: default;
  user-select: none;
}

:global(.provider-select-item[data-highlighted]) {
  background: var(--app-hover);
  color: var(--app-text);
}

:global(.provider-select-indicator) {
  position: absolute;
  left: 9px;
  display: inline-flex;
  color: var(--app-accent);
}

.advanced-settings {
  padding: 11px 12px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 9px;
  background: var(--app-surface-subtle);
}

.advanced-settings summary {
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.context-detection {
  margin: 10px 0 12px;
  color: var(--app-text-tertiary);
  font-size: 11px;
}

.advanced-fields {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.advanced-fields label small {
  display: block;
  margin-top: 5px;
  color: var(--app-text-muted);
  font-size: 10px;
  line-height: 1.4;
}

.secret-input {
  position: relative;
}

.secret-input input {
  padding-right: 40px;
}

.secret-input button {
  position: absolute;
  top: 3px;
  right: 4px;
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

.balance-card {
  padding: 13px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-surface-subtle);
}

.balance-card-header {
  display: flex;
  align-items: center;
  gap: 9px;
}

.balance-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.balance-card-header > div {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.balance-card-header strong {
  color: var(--app-text);
  font-size: 12px;
}

.balance-card-header small {
  color: var(--app-text-muted);
  font-size: 10px;
}

.balance-card-header button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--app-border-strong);
  border-radius: 7px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.balance-card-header button:disabled {
  opacity: 0.55;
  cursor: default;
}

.balance-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.balance-row {
  display: grid;
  gap: 10px;
  padding-top: 11px;
  border-top: 1px solid var(--app-border-subtle);
  grid-template-columns: minmax(110px, 0.8fr) minmax(180px, 1.2fr);
}

.balance-row > div {
  display: grid;
  gap: 2px;
}

.balance-row span,
.balance-row dt {
  color: var(--app-text-muted);
  font-size: 10px;
}

.balance-row strong {
  color: var(--app-text);
  font-size: 18px;
}

.balance-row dl {
  display: grid;
  margin: 0;
  gap: 4px;
}

.balance-row dl > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.balance-row dd {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.balance-status,
.balance-error {
  margin: 0;
  font-size: 10px;
}

.balance-status {
  color: var(--app-success, #067647);
}

.balance-status.unavailable,
.balance-error {
  color: var(--app-danger);
}

.spinning {
  animation: balance-spin 1s linear infinite;
}

.form-error {
  margin: -4px 0 0;
  color: var(--app-danger);
  font-size: 12px;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: auto;
  padding-top: 8px;
}

.action-spacer {
  flex: 1;
}

.primary-button,
.secondary-button,
.delete-config-button {
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

.delete-config-button {
  border: 0;
  background: transparent;
  color: var(--app-danger);
}

.primary-button:disabled,
.secondary-button:disabled,
.delete-config-button:disabled {
  opacity: 0.55;
  cursor: default;
}

.active-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

@media (max-width: 640px) {
  .dialog-body {
    grid-template-columns: 150px 1fr;
  }
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.98);
  }
}

@keyframes balance-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 模型管理
  description: 配置 OpenAI 兼容的模型服务，数据仅保存在本机。
  newConfig: 新建配置
  configName: 配置名称
  configNameExample: 例如：DeepSeek
  baseUrl: 服务商与 Base URL
  providerPreset: 服务商预设
  customProvider: 自定义地址
  baseUrlHelp: 选择服务商可自动填入官方地址；输入框始终可以手动修改。
  modelName: 模型名称
  modelNameExample: 例如：deepseek-chat
  hideApiKey: 隐藏 API Key
  showApiKey: 显示 API Key
  apiKeyStored: 已安全保存，输入新 Key 可替换
  apiKeyStoredHelp: API Key 已由系统密钥链加密；留空将保留现有 Key。
  advancedTokenSettings: 高级 Token 设置
  contextWindowOptional: 上下文窗口（可选）
  autoDetect: 自动识别
  contextWindowHelp: 留空时根据模型名称识别，无法识别则按 16K 估算。
  maxOutputOptional: 最大输出 Token（可选）
  autoReserve: 自动预留
  maxOutputHelp: 用于为模型回复预留空间，不会作为每次请求的强制输出长度。
  setCurrent: 设为当前
  currentConfig: 当前配置
  saving: 保存中…
  saveConfig: 保存配置
  deleteConfirm: 确定删除模型配置“{name}”吗？
  balance:
    title: '{provider} 账户余额'
    description: 通过服务商官方 API 查询，不会显示或传递给界面的 API Key。
    refresh: 查询余额
    querying: 查询中…
    queryFailed: 查询服务商余额失败
    updatedAt: 更新于 {time}
    available: 可用余额
    toppedUp: 充值余额
    granted: 赠送余额
    usable: 当前账户余额可用于 API 调用
    unusable: 当前账户余额不足，无法调用 API
    providers:
      deepseek: DeepSeek
      kimi: Kimi
      siliconflow: 硅基流动
      openrouter: OpenRouter
  contextSource:
    manual: 手动设置
    detected: 根据模型名称自动识别
    fallback: 未识别，使用保守默认值
  validation:
    required: 请填写全部配置项
    invalidBaseUrl: Base URL 必须是有效的 HTTP(S) 地址
    contextMinimum: 上下文窗口不能小于 2,048 Token
    outputMinimum: 最大输出不能小于 256 Token
    outputLessThanContext: 最大输出必须小于上下文窗口
en:
  title: Model management
  description: Configure an OpenAI-compatible model service. Data is stored only on this device.
  newConfig: New configuration
  configName: Configuration name
  configNameExample: 'Example: DeepSeek'
  baseUrl: Provider and Base URL
  providerPreset: Provider preset
  customProvider: Custom URL
  baseUrlHelp: Select a provider to fill its official URL, or edit the field manually.
  modelName: Model name
  modelNameExample: 'Example: deepseek-chat'
  hideApiKey: Hide API key
  showApiKey: Show API key
  apiKeyStored: Securely stored; enter a new key to replace it
  apiKeyStoredHelp: The API key is encrypted with the system keychain. Leave empty to keep it.
  advancedTokenSettings: Advanced token settings
  contextWindowOptional: Context window (optional)
  autoDetect: Detect automatically
  contextWindowHelp: Leave empty to detect it from the model name. Unknown models use a conservative 16K estimate.
  maxOutputOptional: Maximum output tokens (optional)
  autoReserve: Reserve automatically
  maxOutputHelp: Reserves space for model replies without forcing every response to use this length.
  setCurrent: Set as current
  currentConfig: Current configuration
  saving: Saving…
  saveConfig: Save configuration
  deleteConfirm: Delete model configuration “{name}”?
  balance:
    title: '{provider} account balance'
    description: Queried from the provider's official API without exposing the API key to the interface.
    refresh: Check balance
    querying: Checking…
    queryFailed: Failed to query the provider balance
    updatedAt: Updated {time}
    available: Available balance
    toppedUp: Topped-up balance
    granted: Granted balance
    usable: This account has sufficient balance for API calls
    unusable: This account has insufficient balance for API calls
    providers:
      deepseek: DeepSeek
      kimi: Kimi
      siliconflow: SiliconFlow
      openrouter: OpenRouter
  contextSource:
    manual: Manually set
    detected: Automatically detected from the model name
    fallback: Unknown model; using a conservative default
  validation:
    required: Complete all required fields
    invalidBaseUrl: Base URL must be a valid HTTP(S) address
    contextMinimum: Context window cannot be less than 2,048 tokens
    outputMinimum: Maximum output cannot be less than 256 tokens
    outputLessThanContext: Maximum output must be smaller than the context window
</i18n>
