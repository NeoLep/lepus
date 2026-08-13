import { ipcRenderer } from 'electron'
import { WINDOW_CHANNELS, type TitleBarOverlayState } from './constants'

export default {
  setTitleBarOverlay: (state: TitleBarOverlayState): Promise<void> =>
    ipcRenderer.invoke(WINDOW_CHANNELS.TITLE_BAR_OVERLAY_SET, state)
}
