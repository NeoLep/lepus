<script setup lang="ts">
import { computed } from 'vue'
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

const renderedContent = computed(() => {
  const sourceByIndex = new Map((props.sources ?? []).map((source) => [source.index, source]))
  const contentWithCitations = props.content.replace(/\[(\d+)\](?!\()/g, (match, value) => {
    const source = sourceByIndex.get(Number(value))
    return source ? `[${value}](${source.url})` : match
  })
  return markdown.render(contentWithCitations)
})
</script>

<template>
  <!-- markdown-it escapes raw HTML and rejects unsafe link protocols. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-body" v-html="renderedContent"></div>
</template>

<style scoped>
.markdown-body {
  min-width: 0;
  color: #344054;
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
  color: #182230;
  line-height: 1.35;
}

.markdown-body :deep(h1) {
  font-size: 21px;
}

.markdown-body :deep(h2) {
  padding-bottom: 5px;
  border-bottom: 1px solid #eaecf0;
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
  padding: 2px 0 2px 13px;
  border-left: 3px solid #d0d5dd;
  color: #667085;
}

.markdown-body :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(a) {
  color: #175cd3;
  text-decoration: underline;
  text-decoration-color: rgb(23 92 211 / 35%);
  text-underline-offset: 2px;
}

.markdown-body :deep(a:hover) {
  color: #1849a9;
  text-decoration-color: currentcolor;
}

.markdown-body :deep(code) {
  padding: 2px 5px;
  border: 1px solid #e4e7ec;
  border-radius: 5px;
  background: #f9fafb;
  color: #b42318;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.88em;
}

.markdown-body :deep(pre) {
  max-width: 100%;
  padding: 13px 15px;
  overflow-x: auto;
  border: 1px solid #344054;
  border-radius: 10px;
  background: #182230;
}

.markdown-body :deep(pre code) {
  padding: 0;
  border: 0;
  background: transparent;
  color: #f2f4f7;
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
  border: 1px solid #d0d5dd;
  text-align: left;
  white-space: nowrap;
}

.markdown-body :deep(th) {
  background: #f2f4f7;
  color: #182230;
  font-weight: 650;
}

.markdown-body :deep(hr) {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid #eaecf0;
}

.markdown-body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px 0;
  border-radius: 8px;
}

.markdown-body :deep(strong) {
  color: #182230;
  font-weight: 650;
}
</style>
