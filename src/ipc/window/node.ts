import { BrowserWindow, ipcMain } from 'electron'
import { WINDOW_CHANNELS, type TitleBarOverlayState } from './constants'

const MODAL_OVERLAY_COLORS = {
  light: '#8c8c8c',
  dark: '#111111'
} as const

function getTitleBarOverlay(state: TitleBarOverlayState): Electron.TitleBarOverlay {
  if (state.modalOpen) {
    return {
      color: MODAL_OVERLAY_COLORS[state.theme],
      symbolColor: '#ffffff',
      height: 52
    }
  }

  return state.theme === 'dark'
    ? { color: '#1e1e1e', symbolColor: '#f2f2f2', height: 52 }
    : { color: '#ffffff', symbolColor: '#344054', height: 52 }
}

export function initial(): void {
  ipcMain.handle(WINDOW_CHANNELS.TITLE_BAR_OVERLAY_SET, (event, state: TitleBarOverlayState) => {
    if (process.platform === 'darwin') return
    if (state.theme !== 'light' && state.theme !== 'dark') return

    BrowserWindow.fromWebContents(event.sender)?.setTitleBarOverlay(getTitleBarOverlay({
      theme: state.theme,
      modalOpen: Boolean(state.modalOpen)
    }))
  })
}
