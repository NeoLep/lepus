import { ipcRenderer } from 'electron'
import { UPDATE_CHANNELS, type UpdateState } from './constants'

export default {
  queryState: (): Promise<UpdateState> => ipcRenderer.invoke(UPDATE_CHANNELS.STATE_QUERY),
  check: (): Promise<UpdateState> => ipcRenderer.invoke(UPDATE_CHANNELS.CHECK),
  download: (): Promise<UpdateState> => ipcRenderer.invoke(UPDATE_CHANNELS.DOWNLOAD),
  install: (): Promise<void> => ipcRenderer.invoke(UPDATE_CHANNELS.INSTALL),
  onStateChanged: (listener: (state: UpdateState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on(UPDATE_CHANNELS.STATE_CHANGED, handler)
    return () => ipcRenderer.removeListener(UPDATE_CHANNELS.STATE_CHANGED, handler)
  }
}
