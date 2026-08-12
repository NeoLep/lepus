import { ipcRenderer } from 'electron'
import { SCHEDULED_TASK_CHANNELS, type ScheduledTask } from './constants'

export default {
  query: (): Promise<ScheduledTask[]> => ipcRenderer.invoke(SCHEDULED_TASK_CHANNELS.QUERY),
  save: (task: ScheduledTask): Promise<ScheduledTask> =>
    ipcRenderer.invoke(SCHEDULED_TASK_CHANNELS.SAVE, task),
  delete: (id: string): Promise<void> => ipcRenderer.invoke(SCHEDULED_TASK_CHANNELS.DELETE, id),
  runNow: (id: string): Promise<void> => ipcRenderer.invoke(SCHEDULED_TASK_CHANNELS.RUN_NOW, id),
  onChanged: (listener: (task: ScheduledTask) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, task: ScheduledTask): void => listener(task)
    ipcRenderer.on(SCHEDULED_TASK_CHANNELS.CHANGED, handler)
    return () => ipcRenderer.removeListener(SCHEDULED_TASK_CHANNELS.CHANGED, handler)
  }
}
