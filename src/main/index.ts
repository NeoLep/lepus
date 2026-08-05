import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initial } from '../ipc/node'
import { closeChatRepository } from '../ipc/chat/repository'

const APPLICATION_NAME = 'Lepus'
const APPLICATION_ID = 'com.electron'

// Keep Electron's application identity stable because macOS safeStorage binds
// encrypted values to the app's Keychain identity. process.title changes the
// development Dock/process label without invalidating existing ciphertext.
process.title = APPLICATION_NAME

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: APPLICATION_NAME,
    show: false,
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 14, y: 20 }
        }
      : {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#ffffff',
            symbolColor: '#344054',
            height: 52
          }
        }),
    autoHideMenuBar: true,
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Initialize safeStorage with the existing app identity before changing the
  // visible name. On macOS the encryption key belongs to that Keychain identity.
  if (safeStorage.isEncryptionAvailable()) {
    const probe = safeStorage.encryptString('lepus-safe-storage-probe')
    safeStorage.decryptString(probe)
  }
  app.setName(APPLICATION_NAME)

  // Development runs through the Electron executable on macOS, so the
  // packaged ICNS is not applied to the Dock icon automatically.
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId(APPLICATION_ID)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  initial()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', closeChatRepository)

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
