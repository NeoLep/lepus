<script setup lang="ts">
import { computed, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import type { SearchCitation } from '@ipc/chat/constants'

const props = defineProps<{
  content: string
  sources?: SearchCitation[]
}>()

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false
})

const defaultLinkOpen =
  markdown.renderer.rules.link_open ??
  ((tokens, index, options, _environment, renderer) => renderer.renderToken(tokens, index, options))

markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, index, options, environment, renderer)
}

function linkSearchCitations(content: string, sources: SearchCitation[]): string {
  const sourceByIndex = new Map(sources.map((source) => [source.index, source]))

  return content
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part

      return part.replace(
        /\[(\d+)\](?:\((?:https?:\/\/[^)\s]+)(?:\s+["'][^"']*["'])?\))?/g,
        (match, value) => {
          const source = sourceByIndex.get(Number(value))
          return source ? `LEPUSCITATION${value}TOKEN` : match
        }
      )
    })
    .join('')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getSourceLabel(source: SearchCitation): string {
  try {
    return new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    return source.provider
  }
}

function getSafeSourceUrl(source: SearchCitation): string | null {
  try {
    const url = new URL(source.url)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

const renderedContent = computed(() => {
  const sourceByIndex = new Map((props.sources ?? []).map((source) => [source.index, source]))
  const rendered = markdown.render(linkSearchCitations(props.content, props.sources ?? []))

  return rendered.replace(/LEPUSCITATION(\d+)TOKEN/g, (match, value) => {
    const source = sourceByIndex.get(Number(value))
    if (!source) return match
    const url = getSafeSourceUrl(source)
    if (!url) return `#${value}`

    return `<a class="search-citation" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-citation-title="${escapeHtml(source.title)}" data-citation-source="${escapeHtml(getSourceLabel(source))}" aria-label="来源 ${value}：${escapeHtml(source.title)}">#${value}</a>`
  })
})

const tooltip = ref<{ title: string; source: string; left: number; top: number } | null>(null)

function citationFromEvent(event: Event): HTMLAnchorElement | null {
  if (!(event.target instanceof Element)) return null
  return event.target.closest<HTMLAnchorElement>('a.search-citation')
}

function showCitationTooltip(event: Event): void {
  const citation = citationFromEvent(event)
  if (!citation) return

  const bounds = citation.getBoundingClientRect()
  tooltip.value = {
    title: citation.dataset.citationTitle ?? '',
    source: citation.dataset.citationSource ?? '',
    left: Math.max(140, Math.min(window.innerWidth - 140, bounds.left + bounds.width / 2)),
    top: bounds.top - 8
  }
}

function hideCitationTooltip(event: Event): void {
  const citation = citationFromEvent(event)
  if (!citation) return
  if (event instanceof MouseEvent && event.relatedTarget instanceof Node) {
    if (citation.contains(event.relatedTarget)) return
  }
  tooltip.value = null
}
</script>

<template>
  <!-- markdown-it escapes raw HTML and rejects unsafe link protocols. -->
  <!-- eslint-disable vue/no-v-html -->
  <div
    class="markdown-body"
    @mouseover="showCitationTooltip"
    @mouseout="hideCitationTooltip"
    @focusin="showCitationTooltip"
    @focusout="hideCitationTooltip"
    v-html="renderedContent"
  ></div>
  <Teleport to="body">
    <div
      v-if="tooltip"
      class="citation-tooltip"
      role="tooltip"
      :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }"
    >
      <strong>{{ tooltip.title }}</strong>
      <span>{{ tooltip.source }}</span>
    </div>
  </Teleport>
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.markdown-body {
  min-width: 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.markdown-body :deep(> :first-child) {
  margin-top: 0;
}

.markdown-body :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(pre),
.markdown-body :deep(table) {
  margin: 0 0 12px;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 20px 0 9px;
  color: var(--app-text);
  line-height: 1.35;
}

.markdown-body :deep(h1) {
  font-size: 21px;
}

.markdown-body :deep(h2) {
  padding-bottom: 5px;
  border-bottom: 1px solid var(--app-border-subtle);
  font-size: 18px;
}

.markdown-body :deep(h3) {
  font-size: 16px;
}

.markdown-body :deep(h4) {
  font-size: 14px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 24px;
}

.markdown-body :deep(li + li) {
  margin-top: 4px;
}

.markdown-body :deep(blockquote) {
  padding: 8px 12px;
  border-left: 3px solid var(--app-border-strong);
  border-radius: 0 7px 7px 0;
  background: var(--app-blockquote-bg);
  color: var(--app-text-tertiary);
}

.markdown-body :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(a) {
  color: var(--app-link);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--app-link) 35%, transparent);
  text-underline-offset: 2px;
}

.markdown-body :deep(a:hover) {
  color: var(--app-link-hover);
  text-decoration-color: currentcolor;
}

.markdown-body :deep(.search-citation) {
  display: inline-flex;
  align-items: center;
  margin: 0 1px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--app-link-soft);
  color: var(--app-link);
  font-size: 0.78em;
  font-weight: 700;
  line-height: 1.55;
  text-decoration: none;
  vertical-align: 0.08em;
}

.markdown-body :deep(.search-citation:hover),
.markdown-body :deep(.search-citation:focus-visible) {
  background: var(--app-link-soft-hover);
  outline: none;
}

.markdown-body :deep(code) {
  padding: 2px 5px;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  background: var(--app-inline-code-bg);
  color: var(--app-inline-code-text);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.88em;
}

.markdown-body :deep(pre) {
  max-width: 100%;
  padding: 13px 15px;
  overflow-x: auto;
  border: 1px solid var(--app-border-strong);
  border-radius: 10px;
  background: var(--app-code-bg);
}

.markdown-body :deep(pre code) {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-code-text);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre;
}

.markdown-body :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-spacing: 0;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 7px 10px;
  border: 1px solid var(--app-border-strong);
  text-align: left;
  white-space: nowrap;
}

.markdown-body :deep(th) {
  background: var(--app-table-head-bg);
  color: var(--app-text);
  font-weight: 650;
}

.markdown-body :deep(hr) {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid var(--app-border-subtle);
}

.markdown-body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px 0;
  border-radius: 8px;
}

.markdown-body :deep(strong) {
  color: var(--app-text);
  font-weight: 650;
}

.citation-tooltip {
  position: fixed;
  z-index: 100;
  display: flex;
  width: max-content;
  max-width: 280px;
  padding: 8px 10px;
  transform: translate(-50%, -100%);
  flex-direction: column;
  gap: 3px;
  border-radius: 7px;
  background: var(--app-inverse-bg);
  color: var(--app-inverse-text);
  box-shadow: 0 6px 18px rgb(16 24 40 / 20%);
  pointer-events: none;
}

.citation-tooltip strong {
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.citation-tooltip span {
  color: var(--app-text-muted);
  font-size: 10px;
}
</style>
