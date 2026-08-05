<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TooltipContent,
  TooltipPortal,
  TooltipRoot,
  TooltipTrigger
} from 'reka-ui'
import {
  Check,
  ChevronDown,
  Ellipsis,
  FileJson,
  Languages,
  PanelLeft,
  Settings2,
  Share2
} from '@lucide/vue'
import type { ModelConfig, Session } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'
import { setAppLocale, type AppLocale } from '../../i18n'

defineProps<{
  isMac: boolean
  sidebarOpen: boolean
  session: Session | null
  modelConfigs: ModelConfig[]
  activeModelConfig: ModelConfig | null
  modelsLoading: boolean
}>()

const emit = defineEmits<{
  openSidebar: []
  rename: []
  delete: []
  toggleArchive: []
  exportMarkdown: []
  exportJson: []
  selectModel: [id: string]
  manageModels: []
}>()

const { t, locale } = useI18n({ useScope: 'local' })

function changeLocale(nextLocale: AppLocale): void {
  setAppLocale(nextLocale)
}
</script>

<template>
  <header
    class="topbar window-drag-region"
    :class="{
      'mac-without-sidebar': isMac && !sidebarOpen,
      'right-window-controls': !isMac
    }"
  >
    <div class="topbar-start no-drag">
      <TooltipRoot v-if="!sidebarOpen">
        <TooltipTrigger as-child>
          <button
            class="icon-button ml-1.25"
            type="button"
            :aria-label="t('expandSidebar')"
            @click="emit('openSidebar')"
          >
            <PanelLeft :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent class="tooltip-content" side="bottom" :side-offset="7">
            {{ t('expandSidebar') }}
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>

      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <button class="model-trigger" type="button">
            <span>
              {{
                activeModelConfig?.name ??
                (modelsLoading ? t('common.loading') : t('configureModel'))
              }}
            </span>
            <ChevronDown :size="15" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content model-menu" align="start" :side-offset="6">
            <DropdownMenuLabel class="menu-label">{{ t('selectModelConfig') }}</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="config in modelConfigs"
              :key="config.id"
              class="menu-item model-item"
              @select="emit('selectModel', config.id)"
            >
              <Check class="model-check" :class="{ visible: config.isActive }" :size="15" />
              <span
                ><strong>{{ config.name }}</strong
                ><small>{{ config.model }}</small></span
              >
            </DropdownMenuItem>
            <p v-if="!modelsLoading && modelConfigs.length === 0" class="empty-models">
              {{ t('noModelConfigs') }}
            </p>
            <DropdownMenuSeparator class="menu-separator" />
            <DropdownMenuItem class="menu-item" @select="emit('manageModels')">
              <Settings2 :size="15" />
              {{ t('manageModels') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>

    <div class="topbar-drag-space" aria-hidden="true"></div>

    <div class="topbar-actions no-drag">
      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <button class="text-button" type="button" :aria-label="t('locale.language')">
            <Languages :size="16" />
            <span>{{ locale === 'zh-CN' ? t('locale.zhCN') : t('locale.en') }}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content" align="end" :side-offset="6">
            <DropdownMenuLabel class="menu-label">{{ t('locale.language') }}</DropdownMenuLabel>
            <DropdownMenuItem class="menu-item" @select="changeLocale('zh-CN')">
              <Check :class="{ 'locale-check-hidden': locale !== 'zh-CN' }" :size="15" />
              {{ t('locale.zhCN') }}
            </DropdownMenuItem>
            <DropdownMenuItem class="menu-item" @select="changeLocale('en')">
              <Check :class="{ 'locale-check-hidden': locale !== 'en' }" :size="15" />
              {{ t('locale.en') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <button
        class="text-button"
        type="button"
        :disabled="!session"
        @click="emit('exportMarkdown')"
      >
        <Share2 :size="16" />
        <span>{{ t('common.share') }}</span>
      </button>

      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <button class="icon-button" type="button" :aria-label="t('common.more')">
            <Ellipsis :size="19" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content" align="end" :side-offset="6">
            <DropdownMenuItem class="menu-item" :disabled="!session" @select="emit('rename')">
              {{ t('common.rename') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              class="menu-item"
              :disabled="!session"
              @select="emit('toggleArchive')"
            >
              {{ session?.isArchived ? t('restoreChat') : t('archiveChat') }}
            </DropdownMenuItem>
            <DropdownMenuItem class="menu-item" :disabled="!session" @select="emit('exportJson')">
              <FileJson :size="15" />
              {{ t('exportJson') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator class="menu-separator" />
            <DropdownMenuItem
              class="menu-item danger-item"
              :disabled="!session"
              @select="emit('delete')"
            >
              {{ t('deleteChat') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.topbar {
  display: flex;
  height: 52px;
  min-width: 0;
  flex: 0 0 52px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #edf0f2;
  padding: 0 10px 0 12px;
  background: rgb(255 255 255 / 94%);
  &.right-window-controls {
    border-bottom: none !important;
  }
}

.topbar.mac-without-sidebar {
  padding-left: 78px;
}

.topbar.right-window-controls {
  padding-right: 148px;
}

.topbar-start,
.topbar-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.topbar-drag-space {
  min-width: 20px;
  flex: 1 1 auto;
  align-self: stretch;
}

.model-trigger {
  display: inline-flex;
  height: 34px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #1d2939;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.text-button {
  display: inline-flex;
  height: 34px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #475467;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
}

.text-button:disabled {
  cursor: default;
  opacity: 0.45;
}

.model-trigger:hover,
.text-button:hover {
  background: #eef0f3;
  color: #101828;
}

.model-trigger:focus-visible,
.text-button:focus-visible {
  outline: 2px solid #98a2b3;
  outline-offset: 1px;
}

.model-check {
  color: #101828;
  opacity: 0;
}

.model-check.visible {
  opacity: 1;
}

.locale-check-hidden {
  opacity: 0;
}

.empty-models {
  margin: 4px 9px 7px;
  color: #98a2b3;
  font-size: 12px;
}

@media (max-width: 720px) {
  .text-button span {
    display: none;
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  expandSidebar: 展开侧边栏
  configureModel: 配置模型
  selectModelConfig: 选择模型配置
  noModelConfigs: 还没有模型配置
  manageModels: 管理模型
  archiveChat: 归档对话
  restoreChat: 恢复对话
  exportJson: 导出 JSON
  deleteChat: 删除对话
en:
  expandSidebar: Expand sidebar
  configureModel: Configure model
  selectModelConfig: Select model configuration
  noModelConfigs: No model configurations yet
  manageModels: Manage models
  archiveChat: Archive chat
  restoreChat: Restore chat
  exportJson: Export JSON
  deleteChat: Delete chat
</i18n>
