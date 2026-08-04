<script setup lang="ts">
import { computed } from 'vue'
import { FilePenLine } from '@lucide/vue'
import type { ToolCallRecord } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ calls: ToolCallRecord[] }>()
const { t } = useI18n({ useScope: 'local' })

type FileDiff = {
  callId: string
  path: string
  name: string
  diff: string
  additions: number
  deletions: number
  replacements: number
  truncated: boolean
}

const diffs = computed<FileDiff[]>(() =>
  props.calls.flatMap((call) => {
    if (call.name !== 'apply_patch' || call.status !== 'completed' || !call.result) return []
    try {
      const result = JSON.parse(call.result) as {
        ok?: boolean
        data?: {
          path?: unknown
          diff?: unknown
          additions?: unknown
          deletions?: unknown
          replacements?: unknown
          diffTruncated?: unknown
        }
      }
      if (
        !result.ok ||
        typeof result.data?.path !== 'string' ||
        typeof result.data.diff !== 'string'
      ) {
        return []
      }
      const filePath = result.data.path
      return [
        {
          callId: call.id,
          path: filePath,
          name: filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath,
          diff: result.data.diff,
          additions: Number(result.data.additions ?? 0),
          deletions: Number(result.data.deletions ?? 0),
          replacements: Number(result.data.replacements ?? 0),
          truncated: result.data.diffTruncated === true
        }
      ]
    } catch {
      return []
    }
  })
)

function lineClass(line: string): string {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+++') || line.startsWith('---')) return 'file-header'
  if (line.startsWith('+')) return 'added'
  if (line.startsWith('-')) return 'removed'
  return 'context'
}
</script>

<template>
  <div v-if="diffs.length" class="diff-cards">
    <details v-for="diff in diffs" :key="diff.callId" class="diff-card" open>
      <summary>
        <FilePenLine :size="15" />
        <span :title="diff.path">{{ diff.name }}</span>
        <small>{{ t('replacements', { count: diff.replacements }) }}</small>
        <em class="additions">+{{ diff.additions }}</em>
        <em class="deletions">−{{ diff.deletions }}</em>
      </summary>
      <div class="diff-content">
        <code
          v-for="(line, index) in diff.diff.split('\n')"
          :key="index"
          :class="lineClass(line)"
          >{{ line || ' ' }}</code
        >
      </div>
      <p v-if="diff.truncated" class="truncated">{{ t('truncated') }}</p>
    </details>
  </div>
</template>

<style scoped>
.diff-cards {
  display: grid;
  gap: 8px;
  margin: 7px 0 10px;
}

.diff-card {
  overflow: hidden;
  border: 1px solid #d0d5dd;
  border-radius: 9px;
  background: #fff;
}

.diff-card summary {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  background: #f9fafb;
  color: #475467;
  cursor: pointer;
  list-style: none;
}

.diff-card summary::-webkit-details-marker {
  display: none;
}

.diff-card summary > span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #344054;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-card summary small {
  color: #667085;
  font-size: 9px;
}

.diff-card summary em {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}

.additions {
  color: #067647;
}

.deletions {
  color: #b42318;
}

.diff-content {
  max-height: 360px;
  padding: 7px 0;
  overflow: auto;
  border-top: 1px solid #eaecf0;
  background: #101828;
}

.diff-content code {
  display: block;
  min-width: max-content;
  padding: 1px 11px;
  color: #d0d5dd;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  line-height: 1.55;
  white-space: pre;
}

.diff-content .added {
  background: rgb(6 118 71 / 24%);
  color: #abefc6;
}

.diff-content .removed {
  background: rgb(180 35 24 / 24%);
  color: #fecdca;
}

.diff-content .hunk {
  color: #b2ccff;
}

.diff-content .file-header {
  color: #98a2b3;
  font-weight: 650;
}

.truncated {
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid #eaecf0;
  color: #b54708;
  font-size: 9px;
}
</style>

<i18n lang="yaml">
zh-CN:
  replacements: 替换 {count} 处
  truncated: Diff 内容过长，已截断显示。
en:
  replacements: '{count} replacements'
  truncated: The diff was truncated because it is too long.
</i18n>
