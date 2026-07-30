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
import { ChevronDown, Ellipsis, PanelLeft, Share2 } from '@lucide/vue'

defineProps<{
  isMac: boolean
  sidebarOpen: boolean
}>()

const emit = defineEmits<{
  openSidebar: []
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
            <span>GPT-5</span>
            <ChevronDown :size="15" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content model-menu" align="start" :side-offset="6">
            <DropdownMenuLabel class="menu-label">选择模型</DropdownMenuLabel>
            <DropdownMenuItem class="menu-item model-item">
              <span class="model-dot selected"></span>
              <span><strong>GPT-5</strong><small>适合复杂任务</small></span>
            </DropdownMenuItem>
            <DropdownMenuItem class="menu-item model-item">
              <span class="model-dot"></span>
              <span><strong>GPT-5 mini</strong><small>快速日常问答</small></span>
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
            <DropdownMenuItem class="menu-item">重命名</DropdownMenuItem>
            <DropdownMenuItem class="menu-item">归档对话</DropdownMenuItem>
            <DropdownMenuSeparator class="menu-separator" />
            <DropdownMenuItem class="menu-item danger-item">删除对话</DropdownMenuItem>
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

@media (max-width: 720px) {
  .text-button span {
    display: none;
  }
}
</style>
