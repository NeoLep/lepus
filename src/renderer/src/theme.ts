import { ref, watch } from 'vue'

export type AppTheme = 'light' | 'dark'

const STORAGE_KEY = 'lepus-theme'

function initialTheme(): AppTheme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref<AppTheme>(initialTheme())

function isModalOpen(): boolean {
  return document.querySelector('[data-state="open"][class*="overlay"]') !== null
}

function syncTitleBarOverlay(): void {
  void window.api.window.setTitleBarOverlay({ theme: theme.value, modalOpen: isModalOpen() })
}

function applyTheme(value: AppTheme): void {
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
}

applyTheme(theme.value)
syncTitleBarOverlay()

const dialogObserver = new MutationObserver(syncTitleBarOverlay)
dialogObserver.observe(document.body, {
  attributes: true,
  attributeFilter: ['class', 'data-state'],
  childList: true,
  subtree: true
})

watch(theme, (value) => {
  applyTheme(value)
  localStorage.setItem(STORAGE_KEY, value)
  syncTitleBarOverlay()
})

export function useAppTheme(): {
  theme: typeof theme
  toggleTheme: () => void
} {
  return {
    theme,
    toggleTheme: () => {
      theme.value = theme.value === 'dark' ? 'light' : 'dark'
    }
  }
}
