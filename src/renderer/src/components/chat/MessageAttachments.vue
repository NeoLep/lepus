<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { FileText, Image as ImageIcon, X } from '@lucide/vue'
import type { MessageAttachment } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  sessionId: string
  attachments: MessageAttachment[]
  removable?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{ remove: [attachmentId: string] }>()
const previews = ref<Record<string, string>>({})
const { t } = useI18n({ useScope: 'local' })

const imageAttachments = computed(() =>
  props.attachments.filter((attachment) => attachment.kind === 'image')
)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function detail(attachment: MessageAttachment): string {
  if (attachment.kind === 'pdf' && attachment.pageCount) {
    return `${t('pages', { count: attachment.pageCount })} · ${formatSize(attachment.size)}`
  }
  return formatSize(attachment.size)
}

async function loadPreviews(): Promise<void> {
  await Promise.all(
    imageAttachments.value.map(async (attachment) => {
      if (previews.value[attachment.id]) return
      try {
        const preview = await window.api.chat.getAttachmentPreview({
          sessionId: props.sessionId,
          attachment
        })
        previews.value = { ...previews.value, [attachment.id]: preview }
      } catch (error) {
        console.error('Failed to load attachment preview', error)
      }
    })
  )
}

onMounted(() => void loadPreviews())
watch(
  () => props.attachments.map((item) => item.id).join(','),
  () => void loadPreviews()
)
</script>

<template>
  <div class="attachments" :class="{ compact }">
    <div
      v-for="attachment in attachments"
      :key="attachment.id"
      class="attachment-card"
      :class="attachment.kind"
    >
      <div v-if="attachment.kind === 'image'" class="image-preview">
        <img v-if="previews[attachment.id]" :src="previews[attachment.id]" :alt="attachment.name" />
        <ImageIcon v-else :size="20" />
      </div>
      <div v-else class="file-icon"><FileText :size="19" /></div>
      <div class="attachment-copy">
        <strong :title="attachment.name">{{ attachment.name }}</strong>
        <small>
          {{ detail(attachment) }}
          <template v-if="attachment.truncated"> · {{ t('truncated') }}</template>
        </small>
      </div>
      <button
        v-if="removable"
        class="remove-attachment"
        type="button"
        :aria-label="t('remove', { name: attachment.name })"
        @click="emit('remove', attachment.id)"
      >
        <X :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.attachments {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
  margin: 8px 0;
}

.attachments.compact {
  display: flex;
  overflow-x: auto;
  margin: 0 0 9px;
  padding: 1px;
}

.attachment-card {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 11px;
  background: var(--app-surface-subtle);
  color: var(--app-text-secondary);
  text-align: left;
}

.compact .attachment-card {
  width: 210px;
  min-width: 210px;
}

.image-preview,
.file-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: var(--app-surface-muted);
  color: var(--app-text-tertiary);
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.attachment-copy {
  min-width: 0;
  flex: 1;
  color: var(--app-text-secondary);
  text-align: left;
}

.attachment-copy strong,
.attachment-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-copy strong {
  color: var(--app-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.attachment-copy small {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 10px;
  line-height: 1.35;
}

.remove-attachment {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid var(--app-border-strong);
  border-radius: 50%;
  background: var(--app-surface);
  color: var(--app-text-tertiary);
  cursor: pointer;
}

.remove-attachment:hover {
  background: var(--app-hover);
  color: var(--app-danger);
}
</style>

<i18n lang="yaml">
zh-CN:
  pages: '{count} 页'
  truncated: 已截取
  remove: 移除 {name}
en:
  pages: '{count} pages'
  truncated: truncated
  remove: Remove {name}
</i18n>
