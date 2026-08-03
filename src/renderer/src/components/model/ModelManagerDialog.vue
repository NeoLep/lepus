<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import { Check, Eye, EyeOff, Plus, Trash2, X } from '@lucide/vue'
import type { ModelConfig } from '@ipc/chat/constants'

const props = defineProps<{
  configs: ModelConfig[]
  activeId: string | null
  error: string
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

const isExisting = computed(() => props.configs.some((config) => config.id === draft.value.id))

function makeConfig(): ModelConfig {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: '',
    baseURL: '',
    model: '',
    apiKey: '',
    isActive: false,
    createdAt: now,
    updatedAt: now
  }
}

function editConfig(config: ModelConfig): void {
  selectedId.value = config.id
  draft.value = { ...config }
  localError.value = ''
  showApiKey.value = false
}

function createConfig(): void {
  selectedId.value = null
  draft.value = makeConfig()
  localError.value = ''
  showApiKey.value = false
}

function validate(): boolean {
  const config = draft.value
  config.name = config.name.trim()
  config.baseURL = config.baseURL.trim().replace(/\/+$/, '')
  config.model = config.model.trim()
  config.apiKey = config.apiKey.trim()

  if (!config.name || !config.baseURL || !config.model || !config.apiKey) {
    localError.value = '请填写全部配置项'
    return false
  }
  try {
    const url = new URL(config.baseURL)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
  } catch {
    localError.value = 'Base URL 必须是有效的 HTTP(S) 地址'
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
    draft.value = config
  }
}

async function remove(): Promise<void> {
  if (!isExisting.value || saving.value) return
  if (!window.confirm(`确定删除模型配置“${draft.value.name}”吗？`)) return
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
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="model-dialog-overlay" />
      <DialogContent class="model-dialog-content" @open-auto-focus.prevent>
        <header class="dialog-header">
          <div>
            <DialogTitle class="dialog-title">模型管理</DialogTitle>
            <DialogDescription class="dialog-description">
              配置 OpenAI 兼容的模型服务，数据仅保存在本机。
            </DialogDescription>
          </div>
          <DialogClose class="dialog-close" aria-label="关闭"><X :size="18" /></DialogClose>
        </header>

        <div class="dialog-body">
          <aside class="config-list">
            <button class="new-config-button" type="button" @click="createConfig">
              <Plus :size="16" />
              新建配置
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
              <span>配置名称</span>
              <input v-model="draft.name" autocomplete="off" placeholder="例如：DeepSeek" />
            </label>
            <label>
              <span>Base URL</span>
              <input
                v-model="draft.baseURL"
                type="url"
                autocomplete="off"
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label>
              <span>模型名称</span>
              <input v-model="draft.model" autocomplete="off" placeholder="例如：deepseek-chat" />
            </label>
            <label>
              <span>API Key</span>
              <div class="secret-input">
                <input
                  v-model="draft.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  autocomplete="off"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  :aria-label="showApiKey ? '隐藏 API Key' : '显示 API Key'"
                  @click="showApiKey = !showApiKey"
                >
                  <EyeOff v-if="showApiKey" :size="16" />
                  <Eye v-else :size="16" />
                </button>
              </div>
            </label>

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
                删除
              </button>
              <span class="action-spacer"></span>
              <button
                v-if="isExisting && !draft.isActive"
                class="secondary-button"
                type="button"
                :disabled="saving"
                @click="selectCurrent"
              >
                设为当前
              </button>
              <span v-else-if="draft.isActive" class="active-label"
                ><Check :size="14" /> 当前配置</span
              >
              <button class="primary-button" type="submit" :disabled="saving">
                {{ saving ? '保存中…' : '保存配置' }}
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
  background: rgb(16 24 40 / 36%);
  animation: overlay-in 140ms ease-out;
}

.model-dialog-content {
  position: fixed;
  z-index: 81;
  top: 50%;
  left: 50%;
  display: flex;
  width: min(760px, calc(100vw - 40px));
  height: min(540px, calc(100vh - 60px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dfe3e8;
  border-radius: 16px;
  outline: none;
  background: #ffffff;
  box-shadow: 0 24px 70px rgb(16 24 40 / 24%);
  transform: translate(-50%, -50%);
  animation: dialog-in 160ms ease-out;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 22px 17px;
  border-bottom: 1px solid #eaecf0;
}

.dialog-title {
  margin: 0;
  color: #101828;
  font-size: 18px;
  font-weight: 650;
}

.dialog-description {
  margin: 5px 0 0;
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
  flex: 1;
  grid-template-columns: 220px 1fr;
}

.config-list {
  min-height: 0;
  padding: 14px 10px;
  border-right: 1px solid #eaecf0;
  background: #f9fafb;
}

.new-config-button,
.config-item {
  display: flex;
  width: 100%;
  align-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #344054;
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
  background: #eef0f3;
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
  background: #e9ebef;
  color: #101828;
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
  color: #98a2b3;
  font-size: 11px;
}

.config-form {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 15px;
  padding: 22px 24px 18px;
  overflow-y: auto;
}

.config-form label > span {
  display: block;
  margin-bottom: 6px;
  color: #344054;
  font-size: 12px;
  font-weight: 600;
}

.config-form input {
  width: 100%;
  height: 38px;
  padding: 0 11px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  outline: none;
  background: #ffffff;
  color: #182230;
  font: inherit;
  font-size: 13px;
}

.config-form input:focus {
  border-color: #7f8a9b;
  box-shadow: 0 0 0 3px rgb(152 162 179 / 16%);
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
  color: #667085;
  cursor: pointer;
}

.secret-input button:hover {
  background: #f2f4f7;
}

.form-error {
  margin: -4px 0 0;
  color: #d92d20;
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
  border: 1px solid #182230;
  background: #182230;
  color: #ffffff;
}

.secondary-button {
  border: 1px solid #d0d5dd;
  background: #ffffff;
  color: #344054;
}

.delete-config-button {
  border: 0;
  background: transparent;
  color: #d92d20;
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
  color: #475467;
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
</style>
