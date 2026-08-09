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
import { Bot, Boxes, Cpu, Globe2, SlidersHorizontal, X } from '@lucide/vue'
import type { ModelConfig } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'
import ModelManagerDialog from '../model/ModelManagerDialog.vue'
import PromptSettingsDialog from './PromptSettingsDialog.vue'
import RemoteBotDialog from './RemoteBotDialog.vue'
import SearchProviderDialog from './SearchProviderDialog.vue'
import SkillManagerDialog from './SkillManagerDialog.vue'

type SettingsSection = 'remote' | 'skills' | 'search' | 'prompts' | 'models'

const props = withDefaults(
  defineProps<{
    initialSection?: SettingsSection
    configs: ModelConfig[]
    activeId: string | null
    modelError: string
    saveConfig: (config: ModelConfig) => Promise<boolean>
    deleteConfig: (id: string) => Promise<boolean>
    selectConfig: (id: string) => Promise<boolean>
  }>(),
  { initialSection: 'remote' }
)

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ promptSaved: [] }>()
const { t } = useI18n({ useScope: 'local' })
const activeSection = ref<SettingsSection>(props.initialSection)
const pageOpen = computed({
  get: () => open.value,
  set: () => undefined
})

const sections: Array<{
  id: SettingsSection
  label: string
  icon: typeof Bot
}> = [
  { id: 'remote', label: 'remote', icon: Bot },
  { id: 'skills', label: 'skills', icon: Boxes },
  { id: 'search', label: 'search', icon: Globe2 },
  { id: 'prompts', label: 'prompts', icon: SlidersHorizontal },
  { id: 'models', label: 'models', icon: Cpu }
]

function selectSection(section: SettingsSection): void {
  activeSection.value = section
}

watch(
  () => [open.value, props.initialSection] as const,
  ([isOpen, initialSection]) => {
    if (!isOpen) return
    activeSection.value = initialSection
  },
  { immediate: true }
)
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="settings-dialog-overlay" />
      <DialogContent class="settings-dialog-content" @open-auto-focus.prevent>
        <header class="settings-dialog-header">
          <DialogTitle class="settings-dialog-title">{{ t('title') }}</DialogTitle>
          <DialogDescription class="settings-dialog-description">
            {{ t('description') }}
          </DialogDescription>
          <DialogClose class="settings-dialog-close" :aria-label="t('common.close')">
            <X :size="18" />
          </DialogClose>
        </header>

        <div class="settings-dialog-body">
          <nav class="settings-navigation" :aria-label="t('navigation')">
            <button
              v-for="section in sections"
              :key="section.id"
              class="settings-navigation-item"
              :class="{ active: activeSection === section.id }"
              :aria-current="activeSection === section.id ? 'page' : undefined"
              type="button"
              @click="selectSection(section.id)"
            >
              <component :is="section.icon" :size="17" />
              <span>{{ t(section.label) }}</span>
            </button>
          </nav>

          <section class="settings-page">
            <RemoteBotDialog v-if="activeSection === 'remote'" v-model:open="pageOpen" embedded />
            <SkillManagerDialog
              v-else-if="activeSection === 'skills'"
              v-model:open="pageOpen"
              embedded
            />
            <SearchProviderDialog
              v-else-if="activeSection === 'search'"
              v-model:open="pageOpen"
              embedded
            />
            <PromptSettingsDialog
              v-else-if="activeSection === 'prompts'"
              v-model:open="pageOpen"
              embedded
              @saved="emit('promptSaved')"
            />
            <ModelManagerDialog
              v-else
              v-model:open="pageOpen"
              embedded
              :configs="configs"
              :active-id="activeId"
              :error="modelError"
              :save-config="saveConfig"
              :delete-config="deleteConfig"
              :select-config="selectConfig"
            />
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.settings-dialog-overlay {
  position: fixed;
  z-index: 130;
  inset: 0;
  background: var(--app-dialog-overlay);
}

.settings-dialog-content {
  position: fixed;
  z-index: 131;
  top: 50%;
  left: 50%;
  display: grid;
  width: min(1120px, calc(100vw - 40px));
  height: min(780px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 16px;
  outline: none;
  background: var(--app-surface);
  box-shadow: 0 24px 70px rgb(16 24 40 / 28%);
  color: var(--app-text-secondary);
  transform: translate(-50%, -50%);
  grid-template-rows: auto minmax(0, 1fr);
}

.settings-dialog-header {
  display: flex;
  height: 54px;
  align-items: center;
  padding: 0 14px 0 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.settings-dialog-title {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 650;
  flex: 1;
}

.settings-dialog-description {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.settings-dialog-close {
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

.settings-dialog-close:hover {
  background: var(--app-hover);
  color: var(--app-text);
}

.settings-dialog-body {
  display: grid;
  min-height: 0;
  overflow: hidden;
  grid-template-columns: 210px minmax(0, 1fr);
}

.settings-navigation {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 3px;
  padding: 14px 12px;
  overflow-y: auto;
  border-right: 1px solid var(--app-border-subtle);
  background: var(--app-surface-subtle);
}

.settings-navigation-item {
  display: flex;
  width: 100%;
  height: 38px;
  align-items: center;
  gap: 10px;
  padding: 0 11px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.settings-navigation-item:hover {
  background: var(--app-hover);
  color: var(--app-text-secondary);
}

.settings-navigation-item.active {
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-weight: 600;
}

.settings-page {
  display: flex;
  min-width: 0;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
  background: var(--app-surface);
}

.settings-page :deep(.remote-dialog.embedded),
.settings-page :deep(.skill-dialog-content.embedded),
.settings-page :deep(.search-dialog-content.embedded),
.settings-page :deep(.prompt-dialog-content.embedded),
.settings-page :deep(.model-dialog-content.embedded) {
  min-width: 0;
  min-height: 0;
  max-width: none;
  max-height: none;
}

.settings-page :deep(.remote-dialog.embedded .remote-header),
.settings-page :deep(.skill-dialog-content.embedded .skill-dialog-header),
.settings-page :deep(.search-dialog-content.embedded .dialog-header),
.settings-page :deep(.prompt-dialog-content.embedded .dialog-header),
.settings-page :deep(.model-dialog-content.embedded .dialog-header) {
  display: flex;
  min-height: 72px;
  box-sizing: border-box;
  align-items: flex-start;
  padding: 17px 22px 15px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.settings-page :deep(.remote-dialog.embedded .remote-icon),
.settings-page :deep(.skill-dialog-content.embedded .skill-title-icon) {
  display: none;
}

.settings-page :deep(.remote-dialog.embedded .remote-header > div),
.settings-page :deep(.skill-dialog-content.embedded .skill-dialog-header > div) {
  min-width: 0;
  flex: 1;
}

.settings-page :deep(.remote-dialog.embedded .remote-header h2),
.settings-page :deep(.skill-dialog-content.embedded .skill-dialog-title),
.settings-page :deep(.search-dialog-content.embedded .dialog-title),
.settings-page :deep(.prompt-dialog-content.embedded .dialog-title),
.settings-page :deep(.model-dialog-content.embedded .dialog-title) {
  margin: 0;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}

.settings-page :deep(.remote-dialog.embedded .remote-header p),
.settings-page :deep(.skill-dialog-content.embedded .skill-dialog-description),
.settings-page :deep(.search-dialog-content.embedded .dialog-description),
.settings-page :deep(.prompt-dialog-content.embedded .dialog-description),
.settings-page :deep(.model-dialog-content.embedded .dialog-description) {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 760px) {
  .settings-dialog-content {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
  }

  .settings-dialog-body {
    grid-template-columns: 154px minmax(0, 1fr);
  }

  .settings-navigation-item {
    padding: 0 9px;
    font-size: 12px;
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 设置
  description: 管理 Lepus 的连接、能力与模型配置。
  navigation: 设置菜单
  remote: 远程接入
  skills: Skill 管理
  search: 互联网搜索
  prompts: 提示词设计
  models: 模型管理
en:
  title: Settings
  description: Manage Lepus connections, capabilities, and model configuration.
  navigation: Settings menu
  remote: Remote access
  skills: Skill management
  search: Web search
  prompts: Prompt design
  models: Model management
</i18n>
