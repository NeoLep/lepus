<script setup lang="ts">
import { computed } from 'vue'
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import {
  Bot,
  Check,
  Clipboard,
  Code2,
  Download,
  FilePenLine,
  Files,
  Globe2,
  KeyRound,
  Search,
  Wrench
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { AgentCapability } from '@/shared/agent/capabilities'
import type { Component } from 'vue'

const model = defineModel<AgentCapability[]>({ required: true })
const props = withDefaults(
  defineProps<{ unattended?: boolean; compact?: boolean }>(),
  { unattended: false, compact: false }
)
const { t } = useI18n({ useScope: 'local' })

type CapabilityItem = { id: AgentCapability; icon: Component; risk?: boolean }
type CapabilityGroup = { title: string; items: CapabilityItem[] }

const groups = computed<CapabilityGroup[]>(() => [
  {
    title: t('basic'),
    items: [
      { id: 'utilities' as const, icon: Wrench },
      { id: 'web_search' as const, icon: Search },
      { id: 'skills' as const, icon: Bot }
    ]
  },
  {
    title: t('files'),
    items: [
      { id: 'workspace_read' as const, icon: Files },
      { id: 'workspace_write' as const, icon: FilePenLine, risk: true },
      { id: 'downloads' as const, icon: Download, risk: true }
    ]
  },
  {
    title: t('system'),
    items: [
      { id: 'skill_scripts' as const, icon: Code2, risk: true },
      { id: 'browser_public' as const, icon: Globe2 },
      { id: 'browser_private' as const, icon: KeyRound, risk: true },
      { id: 'clipboard' as const, icon: Clipboard, risk: true }
    ]
  }
])

function checked(id: AgentCapability): boolean {
  return model.value.includes(id)
}

function setChecked(id: AgentCapability, value: boolean | 'indeterminate'): void {
  if (value === true && !checked(id)) model.value = [...model.value, id]
  if (value === false) model.value = model.value.filter((item) => item !== id)
}
</script>

<template>
  <div class="capability-picker" :class="{ compact: props.compact }">
    <p v-if="props.unattended" class="preauthorized-note">
      <KeyRound :size="14" />{{ t('preauthorized') }}
    </p>
    <section v-for="group in groups" :key="group.title">
      <h4>{{ group.title }}</h4>
      <div class="capability-grid">
        <label
          v-for="item in group.items"
          :key="item.id"
          class="capability-card"
          :class="{ selected: checked(item.id), risk: item.risk }"
        >
          <component :is="item.icon" :size="17" class="capability-icon" />
          <span class="capability-copy">
            <strong>{{ t(`${item.id}.title`) }}</strong>
            <small>{{ t(`${item.id}.description`) }}</small>
          </span>
          <CheckboxRoot
            class="capability-checkbox"
            :model-value="checked(item.id)"
            @update:model-value="setChecked(item.id, $event)"
          >
            <CheckboxIndicator><Check :size="13" stroke-width="3" /></CheckboxIndicator>
          </CheckboxRoot>
        </label>
      </div>
    </section>
  </div>
</template>

<style scoped>
.capability-picker { display: grid; gap: 13px; }
.capability-picker section { display: grid; gap: 7px; }
.capability-picker h4 { margin: 0; color: var(--app-text-muted); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.capability-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.capability-card { position: relative; display: grid; min-width: 0; grid-template-columns: auto 1fr auto; align-items: start; gap: 9px; padding: 11px; border: 1px solid var(--app-border-subtle); border-radius: 10px; background: var(--app-surface); cursor: pointer; transition: border-color .15s, background .15s; }
.capability-card:hover { border-color: var(--app-border-strong); background: var(--app-surface-subtle); }
.capability-card.selected { border-color: color-mix(in srgb, var(--app-accent) 52%, var(--app-border-strong)); background: var(--app-accent-soft); }
.capability-icon { margin-top: 1px; color: var(--app-text-muted); }
.capability-card.selected .capability-icon { color: var(--app-accent); }
.capability-copy { display: grid; min-width: 0; gap: 3px; }
.capability-copy strong { color: var(--app-text); font-size: 12px; line-height: 1.25; }
.capability-copy small { color: var(--app-text-muted); font-size: 10px; line-height: 1.4; }
.capability-checkbox { display: grid; width: 18px; height: 18px; flex: none; place-items: center; border: 1px solid var(--app-border-strong); border-radius: 5px; background: var(--app-surface); color: white; }
.capability-checkbox[data-state='checked'] { border-color: var(--app-accent); background: var(--app-accent); }
.preauthorized-note { display: flex; align-items: center; gap: 6px; margin: 0; padding: 8px 10px; border-radius: 8px; background: var(--app-warning-soft, #fffaeb); color: var(--app-warning, #b54708); font-size: 10px; line-height: 1.4; }
.compact .capability-grid { grid-template-columns: 1fr; }
@media (max-width: 700px) { .capability-grid { grid-template-columns: 1fr; } }
</style>

<i18n lang="yaml">
zh-CN:
  basic: 基础能力
  files: 文件与工作区
  system: 本机与交互
  preauthorized: 无人值守任务中，勾选的能力将无需再次确认；请按最小权限原则选择。
  utilities:
    title: 实用工具
    description: 时间、计算与 UUID
  web_search:
    title: 联网搜索
    description: 查询公开网络信息
  workspace_read:
    title: 读取工作区
    description: 搜索、列出并读取文件
  workspace_write:
    title: 修改工作区
    description: 新建、编辑、移动和删除文件
  skills:
    title: 使用 Skills
    description: 匹配并读取已安装 Skill 指令
  skill_scripts:
    title: 运行 Skill 脚本
    description: 执行 Skill 附带的本地代码
  browser_public:
    title: 公共浏览器
    description: 打开网页并进行页面交互
  browser_private:
    title: 登录态浏览器
    description: 使用现有账号与私有页面
  clipboard:
    title: 读取剪贴板
    description: 获取当前剪贴板文本
  downloads:
    title: 下载文件
    description: 将网络文件写入工作区
en:
  basic: Core
  files: Files and workspace
  system: Local and interactive
  preauthorized: Selected capabilities run without another prompt in unattended tasks. Grant only what is needed.
  utilities:
    title: Utilities
    description: Time, calculation, and UUID
  web_search:
    title: Web search
    description: Search public web information
  workspace_read:
    title: Read workspace
    description: Search, list, and read files
  workspace_write:
    title: Modify workspace
    description: Create, edit, move, and delete files
  skills:
    title: Use Skills
    description: Match and read installed Skill instructions
  skill_scripts:
    title: Run Skill scripts
    description: Execute local code bundled with Skills
  browser_public:
    title: Public browser
    description: Open and interact with public pages
  browser_private:
    title: Signed-in browser
    description: Use existing accounts and private pages
  clipboard:
    title: Read clipboard
    description: Read current clipboard text
  downloads:
    title: Download files
    description: Write network files into the workspace
</i18n>
