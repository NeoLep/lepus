import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { UPDATE_CHANNELS, type UpdateState } from '@/ipc/update/constants'

function releaseNotesText(notes: UpdateInfo['releaseNotes']): string | undefined {
  if (typeof notes === 'string') return notes
  if (!Array.isArray(notes)) return undefined
  return notes
    .map((entry) =>
      [entry.version ? `## ${entry.version}` : '', entry.note ?? ''].filter(Boolean).join('\n')
    )
    .filter(Boolean)
    .join('\n\n')
}

class AppUpdateManager {
  private state: UpdateState = {
    status: 'idle',
    currentVersion: app.getVersion()
  }

  private initialized = false
  private operation: Promise<UpdateState> | null = null

  initialize(): void {
    if (this.initialized) return
    this.initialized = true

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => this.setState({ status: 'checking' }))
    autoUpdater.on('update-available', (info) => {
      this.setState({
        status: 'available',
        availableVersion: info.version,
        releaseName: info.releaseName ?? undefined,
        releaseNotes: releaseNotesText(info.releaseNotes),
        releaseDate: info.releaseDate
      })
    })
    autoUpdater.on('update-not-available', () => {
      this.setState({ status: 'not-available' })
    })
    autoUpdater.on('download-progress', (progress) => this.onDownloadProgress(progress))
    autoUpdater.on('update-downloaded', (info) => {
      this.setState({
        status: 'downloaded',
        availableVersion: info.version,
        releaseName: info.releaseName ?? undefined,
        releaseNotes: releaseNotesText(info.releaseNotes),
        releaseDate: info.releaseDate,
        percent: 100
      })
    })
    autoUpdater.on('error', (error) => {
      this.setState({ status: 'error', error: this.friendlyError(error) })
    })

    ipcMain.handle(UPDATE_CHANNELS.STATE_QUERY, () => this.state)
    ipcMain.handle(UPDATE_CHANNELS.CHECK, () => this.check())
    ipcMain.handle(UPDATE_CHANNELS.DOWNLOAD, () => this.download())
    ipcMain.handle(UPDATE_CHANNELS.INSTALL, () => this.install())
  }

  private setState(changes: Partial<UpdateState>): UpdateState {
    const versionFields =
      changes.status === 'checking' || changes.status === 'not-available'
        ? {
            availableVersion: undefined,
            releaseName: undefined,
            releaseNotes: undefined,
            releaseDate: undefined,
            percent: undefined,
            transferred: undefined,
            total: undefined,
            bytesPerSecond: undefined,
            error: undefined
          }
        : {}
    this.state = { ...this.state, ...versionFields, ...changes }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(UPDATE_CHANNELS.STATE_CHANGED, this.state)
    }
    return this.state
  }

  private onDownloadProgress(progress: ProgressInfo): void {
    this.setState({
      status: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      error: undefined
    })
  }

  private unsupportedState(message: string): UpdateState {
    return this.setState({ status: 'unsupported', error: message })
  }

  private ensureSupported(): UpdateState | null {
    if (!app.isPackaged)
      return this.unsupportedState('开发环境不支持应用内更新，请使用正式安装包测试。')
    if (process.platform === 'linux' && !process.env['APPIMAGE']) {
      return this.unsupportedState('Linux 应用内安装仅支持 AppImage；DEB 安装请使用系统包管理器。')
    }
    return null
  }

  private async run(operation: () => Promise<UpdateState>): Promise<UpdateState> {
    if (this.operation) return this.operation
    this.operation = operation().finally(() => {
      this.operation = null
    })
    return this.operation
  }

  private async check(): Promise<UpdateState> {
    const unsupported = this.ensureSupported()
    if (unsupported) return unsupported
    return this.run(async () => {
      try {
        await autoUpdater.checkForUpdates()
        return this.state
      } catch (error) {
        return this.setState({ status: 'error', error: this.friendlyError(error) })
      }
    })
  }

  private async download(): Promise<UpdateState> {
    const unsupported = this.ensureSupported()
    if (unsupported) return unsupported
    if (this.state.status !== 'available' && this.state.status !== 'error') return this.state
    return this.run(async () => {
      try {
        this.setState({ status: 'downloading', percent: 0, error: undefined })
        await autoUpdater.downloadUpdate()
        return this.state
      } catch (error) {
        return this.setState({ status: 'error', error: this.friendlyError(error) })
      }
    })
  }

  private install(): void {
    if (this.state.status !== 'downloaded') throw new Error('更新尚未下载完成')
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }

  private friendlyError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    if (/404|latest.*yml|channel file/i.test(message)) {
      return 'GitHub Release 缺少当前平台的更新元数据，或尚未发布可用版本。'
    }
    return message
  }
}

export const appUpdateManager = new AppUpdateManager()
