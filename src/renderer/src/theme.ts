import { ref, watch } from 'vue'

export type AppTheme = 'light' | 'dark'

const STORAGE_KEY = 'lepus-theme'

function initialTheme(): AppTheme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref<AppTheme>(initialTheme())

function applyTheme(value: AppTheme): void {
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
}

applyTheme(theme.value)

watch(theme, (value) => {
  applyTheme(value)
  localStorage.setItem(STORAGE_KEY, value)
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
