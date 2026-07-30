<script setup lang="ts">
import { ref } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle, TooltipProvider } from 'reka-ui'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppTopbar from './components/layout/AppTopbar.vue'
import ChatView from './components/chat/ChatView.vue'

type SplitterPanelInstance = {
  collapse: () => void
  expand: () => void
}

const sidebarOpen = ref(true)
const sidebarPanel = ref<SplitterPanelInstance | null>(null)
const isMac = navigator.userAgent.includes('Mac')

function closeSidebar(): void {
  sidebarPanel.value?.collapse()
}

function openSidebar(): void {
  sidebarPanel.value?.expand()
}
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <SplitterGroup class="app-shell" direction="horizontal">
      <SplitterPanel
        id="sidebar"
        ref="sidebarPanel"
        :order="1"
        :default-size="28"
        :min-size="20"
        :max-size="42"
        :collapsed-size="0"
        collapsible
        @collapse="sidebarOpen = false"
        @expand="sidebarOpen = true"
      >
        <AppSidebar v-if="sidebarOpen" :is-mac="isMac" @close="closeSidebar" />
      </SplitterPanel>

      <SplitterResizeHandle
        id="sidebar-resize-handle"
        class="splitter-handle"
        :class="{ collapsed: !sidebarOpen }"
      />

      <SplitterPanel id="workspace" :order="2" :min-size="58">
        <section class="workspace">
          <AppTopbar :is-mac="isMac" :sidebar-open="sidebarOpen" @open-sidebar="openSidebar" />
          <ChatView />
        </section>
      </SplitterPanel>
    </SplitterGroup>
  </TooltipProvider>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  min-width: 520px;
  overflow: hidden;
  background: #ffffff;
  color: #182230;
  font-family:
    Inter,
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.workspace {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
}

.splitter-handle {
  position: relative;
  z-index: 10;
  width: 7px;
  flex: 0 0 7px;
  margin: 0 -3px;
  background: transparent;
  cursor: col-resize;
  outline: none;
}

.splitter-handle::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: #e4e7ec;
  content: '';
  transform: translateX(-50%);
  transition: background 140ms ease;
}

.splitter-handle:hover::before,
.splitter-handle[data-state='drag']::before,
.splitter-handle:focus-visible::before {
  background: #7f8a9b;
}

.splitter-handle.collapsed {
  width: 0;
  flex-basis: 0;
  margin: 0;
  cursor: default;
}

.splitter-handle.collapsed::before {
  display: none;
}
</style>
