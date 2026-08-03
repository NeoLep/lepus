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
import { Check, ChevronDown, Ellipsis, PanelLeft, Settings2, Share2 } from '@lucide/vue'
import type { ModelConfig, Session } from '@ipc/chat/constants'

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
  selectModel: [id: string]
  manageModels: []
}>()
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
            class="icon-button"
            type="button"
            aria-label="展开侧边栏"
            @click="emit('openSidebar')"
          >
            <PanelLeft :size="18" />
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent class="tooltip-content" side="bottom" :side-offset="7">
            展开侧边栏
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>

      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <button class="model-trigger" type="button">
            <span>{{ activeModelConfig?.name ?? (modelsLoading ? '加载中…' : '配置模型') }}</span>
            <ChevronDown :size="15" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content model-menu" align="start" :side-offset="6">
            <DropdownMenuLabel class="menu-label">选择模型配置</DropdownMenuLabel>
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
              还没有模型配置
            </p>
            <DropdownMenuSeparator class="menu-separator" />
            <DropdownMenuItem class="menu-item" @select="emit('manageModels')">
              <Settings2 :size="15" />
              管理模型
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>

    <div class="topbar-drag-space" aria-hidden="true"></div>

    <div class="topbar-actions no-drag">
      <button class="text-button" type="button">
        <Share2 :size="16" />
        <span>分享</span>
      </button>

      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <button class="icon-button" type="button" aria-label="更多选项">
            <Ellipsis :size="19" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content" align="end" :side-offset="6">
            <DropdownMenuItem class="menu-item" :disabled="!session" @select="emit('rename')">
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem class="menu-item">归档对话</DropdownMenuItem>
            <DropdownMenuSeparator class="menu-separator" />
            <DropdownMenuItem
              class="menu-item danger-item"
              :disabled="!session"
              @select="emit('delete')"
            >
              删除对话
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
  </header>
</template>

<style scoped>
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
