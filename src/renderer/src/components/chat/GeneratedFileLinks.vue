<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, FileText, LoaderCircle } from '@lucide/vue'
import type { ToolCallRecord } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ calls: ToolCallRecord[] }>()
const { t } = useI18n({ useScope: 'local' })
const openingPath = ref('')
const errorByPath = ref<Record<string, string>>({})

type GeneratedFile = { callId: string; path: string; name: string }

const files = computed<GeneratedFile[]>(() =>
  props.calls.flatMap((call) => {
    if (
      !['write_file', 'copy_file', 'move_file', 'apply_patch'].includes(call.name) ||
      call.status !== 'completed' ||
      !call.result
    ) {
      return []
    }
    try {
      const result = JSON.parse(call.result) as {
        ok?: boolean
        data?: { path?: unknown; destinationPath?: unknown }
      }
      const outputPath = ['write_file', 'apply_patch'].includes(call.name)
        ? result.data?.path
        : result.data?.destinationPath
      if (!result.ok || typeof outputPath !== 'string') return []
      const path = outputPath
      const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
      return [{ callId: call.id, path, name }]
    } catch {
      return []
    }
  })
)

async function openFile(file: GeneratedFile): Promise<void> {
  if (openingPath.value) return
  openingPath.value = file.path
  const errors = { ...errorByPath.value }
  delete errors[file.path]
  errorByPath.value = errors
  try {
    await window.api.chat.openGeneratedFile(file.path)
  } catch (error) {
    errorByPath.value = {
      ...errorByPath.value,
      [file.path]: error instanceof Error ? error.message : t('openFailed')
    }
  } finally {
    openingPath.value = ''
  }
}
</script>

<template>
  <div v-if="files.length" class="generated-files">
    <div v-for="file in files" :key="file.callId" class="generated-file-row">
      <button type="button" :title="file.path" @click="openFile(file)">
        <FileText :size="15" />
        <span>{{ file.name }}</span>
        <LoaderCircle v-if="openingPath === file.path" class="spin" :size="13" />
        <ExternalLink v-else :size="13" />
      </button>
      <small v-if="errorByPath[file.path]">{{ errorByPath[file.path] }}</small>
    </div>
  </div>
</template>

<style scoped>
.generated-files {
  display: flex;
  margin: 7px 0 10px;
  flex-wrap: wrap;
  gap: 7px;
}

.generated-file-row {
  min-width: 0;
}

.generated-file-row button {
  display: inline-flex;
  max-width: 320px;
  height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  cursor: pointer;
}

.generated-file-row button:hover,
.generated-file-row button:focus-visible {
  border-color: var(--app-text-muted);
  background: var(--app-surface-subtle);
}

.generated-file-row button span {
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generated-file-row button > svg:last-child {
  flex: 0 0 auto;
  color: var(--app-text-tertiary);
}

.generated-file-row small {
  display: block;
  max-width: 320px;
  margin-top: 4px;
  color: var(--app-danger);
  font-size: 9px;
}

.spin {
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  openFailed: 无法打开文件
en:
  openFailed: Unable to open file
</i18n>
