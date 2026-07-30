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
  Ellipsis,
  MessageSquare,
  PanelLeft,
  Search,
  Settings,
  SquarePen,
  UserRound
} from '@lucide/vue'

defineProps<{
  isMac: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const conversations = [
  { id: 1, title: '设计一个聊天应用框架', active: true },
  { id: 2, title: 'Electron 窗口配置', active: false },
  { id: 3, title: '前端项目开发计划', active: false },
  { id: 4, title: '整理本周工作内容', active: false }
]
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header window-drag-region" :class="{ 'mac-window-controls': isMac }">
      <div class="sidebar-header-actions no-drag">
        <TooltipRoot>
          <TooltipTrigger as-child>
            <button
              class="icon-button"
              type="button"
              aria-label="收起侧边栏"
              @click="emit('close')"
            >
              <PanelLeft :size="18" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent class="tooltip-content" side="bottom" :side-offset="7">
              收起侧边栏
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </div>
    </div>

    <nav class="sidebar-body" aria-label="对话导航">
      <button class="sidebar-action" type="button">
        <SquarePen :size="17" />
        <span>新建对话</span>
        <kbd>{{ isMac ? '⌘ N' : 'Ctrl N' }}</kbd>
      </button>
      <button class="sidebar-action" type="button">
        <Search :size="17" />
        <span>搜索对话</span>
        <kbd>{{ isMac ? '⌘ K' : 'Ctrl K' }}</kbd>
      </button>

      <div class="conversation-section">
        <p class="section-label">最近</p>
        <button
          v-for="conversation in conversations"
          :key="conversation.id"
          class="conversation-item"
          :class="{ active: conversation.active }"
          type="button"
        >
          <MessageSquare :size="15" />
          <span>{{ conversation.title }}</span>
          <Ellipsis class="conversation-more" :size="16" />
        </button>
      </div>
    </nav>

    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button class="account-button" type="button">
          <span class="avatar"><UserRound :size="16" /></span>
          <span class="account-copy">
            <strong>Lee</strong>
            <small>个人账户</small>
          </span>
          <Ellipsis :size="17" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          class="menu-content account-menu"
          side="right"
          align="end"
          :side-offset="8"
        >
          <DropdownMenuLabel class="menu-label">账户</DropdownMenuLabel>
          <DropdownMenuItem class="menu-item">
            <Settings :size="16" />
            设置
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-separator" />
          <DropdownMenuItem class="menu-item muted-item">退出登录</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  background: #f7f8fa;
}

.sidebar-header {
  display: flex;
  height: 52px;
  flex: 0 0 52px;
  align-items: center;
  justify-content: flex-end;
  padding: 0 10px 0 12px;
}

.sidebar-header.mac-window-controls {
  padding-left: 78px;
}

.brand-mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  background: #111827;
  color: white;
}

.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sidebar-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
}

.conversation-item {
  margin-bottom: 1px;
}

.sidebar-action,
.conversation-item,
.account-button {
  display: flex;
  width: 100%;
  align-items: center;
  border: 0;
  color: #344054;
  text-align: left;
  cursor: pointer;
}

.sidebar-action {
  height: 38px;
  gap: 10px;
  padding: 0 10px;
  border-radius: 9px;
  background: transparent;
  font-size: 13px;
  font-weight: 540;
}

.sidebar-action:hover,
.conversation-item:hover,
.account-button:hover {
  background: #eceef1;
}

.sidebar-action span {
  flex: 1;
}

kbd {
  color: #98a2b3;
  font-family: inherit;
  font-size: 11px;
}

.conversation-section {
  margin-top: 20px;
}

.section-label {
  margin: 0 10px 7px;
  color: #98a2b3;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.conversation-item {
  height: 38px;
  gap: 9px;
  padding: 0 9px;
  border-radius: 9px;
  background: transparent;
  font-size: 13px;
}

.conversation-item.active {
  background: #e9ebef;
  color: #101828;
}

.conversation-item > span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-more {
  opacity: 0;
}

.conversation-item:hover .conversation-more,
.conversation-item.active .conversation-more {
  opacity: 1;
}

.account-button {
  gap: 10px;
  margin: 4px 8px 9px;
  width: calc(100% - 16px);
  padding: 8px;
  border-radius: 11px;
  background: transparent;
}

.avatar {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border: 1px solid #d0d5dd;
  border-radius: 50%;
  background: #ffffff;
}

.account-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.account-copy strong {
  font-size: 13px;
  font-weight: 600;
}

.account-copy small {
  color: #98a2b3;
  font-size: 11px;
}
</style>
