export type AppTheme = 'light' | 'dark'

export type TitleBarOverlayState = {
  theme: AppTheme
  modalOpen: boolean
}

export const WINDOW_CHANNELS = {
  TITLE_BAR_OVERLAY_SET: 'window:title-bar-overlay-set'
} as const
