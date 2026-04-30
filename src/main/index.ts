import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { registerIpcMainHandlers } from './utils/ipc'
import windowStateKeeper from 'electron-window-state'
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, powerMonitor, screen, shell } from 'electron'
import { addProfileItem, getAppConfig, patchControledMihomoConfig } from './config'
import { quitWithoutCore, startCore, stopCore } from './core/manager'
import { triggerSysProxy } from './sys/sysproxy'
import pngIcon from '../../resources/icon.png?asset'
import icoIcon from '../../resources/icon.ico?asset'
import { createTray } from './resolve/tray'
import { createApplicationMenu } from './resolve/menu'
import { init } from './utils/init'
import path, { join } from 'path'
import { initShortcut } from './resolve/shortcut'
import { spawn } from 'child_process'
import { createElevateTaskSync, runElevateTaskSync } from './sys/misc'
import { initProfileUpdater } from './core/profileUpdater'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { exePath, taskDir } from './utils/dirs'
import { showFloatingWindow } from './resolve/floatingWindow'
import { getAppConfigSync } from './config/app'
import { t } from './utils/i18n'
import { checkForAppUpdates } from './core/appUpdater'

let quitTimeout: NodeJS.Timeout | null = null
export let mainWindow: BrowserWindow | null = null
export let needsFirstRunAdmin = false

app.setName('GUAR Clash')

const COMPACT_WINDOW = {
  width: 340,
  height: 520,
  minWidth: 340,
  minHeight: 520
}

function getWindowLayout(): typeof COMPACT_WINDOW {
  const base = COMPACT_WINDOW
  const workArea = screen.getPrimaryDisplay().workAreaSize
  return {
    ...base,
    height: Math.min(base.height, Math.max(base.minHeight, workArea.height - 40))
  }
}

/**
 * Show error to the user via renderer toast notification.
 * Falls back to system dialog if the window is not available.
 */
export function showError(title: string, message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('showError', title, message)
  } else {
    dialog.showErrorBox(title, message)
  }
}
let pendingDeepLink: string | null = null
let coreReadyForDeepLinks = false
let handlingPendingDeepLink = false
let isCreatingWindow = false
let windowShown = false
let createWindowPromiseResolve: (() => void) | null = null
let createWindowPromise: Promise<void> | null = null
const DEEP_LINK_PATTERN = /guar:\/\/[^\s"']+/i

async function scheduleLightweightMode(): Promise<void> {
  const {
    autoLightweight = false,
    autoLightweightDelay = 60,
    autoLightweightMode = 'core'
  } = await getAppConfig()

  if (!autoLightweight) return

  if (quitTimeout) {
    clearTimeout(quitTimeout)
  }

  const enterLightweightMode = async (): Promise<void> => {
    if (autoLightweightMode === 'core') {
      await quitWithoutCore()
    } else if (autoLightweightMode === 'tray') {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.destroy()
        if (process.platform === 'darwin' && app.dock) {
          app.dock.hide()
        }
      }
    }
  }

  quitTimeout = setTimeout(enterLightweightMode, autoLightweightDelay * 1000)
}

const syncConfig = getAppConfigSync()

if (
  process.platform === 'win32' &&
  !is.dev &&
  !process.argv.includes('noadmin') &&
  syncConfig.corePermissionMode !== 'service'
) {
  try {
    createElevateTaskSync()
  } catch {
    // Only use the runner when the registered task points to this exact build.
    // Stale tasks from dev/old builds can point to a deleted executable.
    if (runElevateTaskSync(process.argv.slice(1))) {
      app.exit()
    } else {
      needsFirstRunAdmin = true
    }
  }
}

if (process.platform === 'win32' && is.dev) {
  patchControledMihomoConfig({ tun: { enable: false } })
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

export function customRelaunch(): void {
  const script = `while kill -0 ${process.pid} 2>/dev/null; do
  sleep 0.1
done
${process.argv.join(' ')} & disown
exit
`
  spawn('sh', ['-c', `"${script}"`], {
    shell: true,
    detached: true,
    stdio: 'ignore'
  })
}

if (process.platform === 'linux') {
  app.relaunch = customRelaunch
}

if (process.platform === 'win32' && !exePath().startsWith('C')) {
  // https://github.com/electron/electron/issues/43278
  // https://github.com/electron/electron/issues/36698
  app.commandLine.appendSwitch('in-process-gpu')
}

const initPromise = init()

if (syncConfig.disableGPU) {
  app.disableHardwareAcceleration()
}

function normalizeDeepLink(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim().replace(/^["']|["']$/g, '')
  if (trimmed.toLowerCase().startsWith('guar://')) return trimmed
  return trimmed.match(DEEP_LINK_PATTERN)?.[0]
}

function getDeepLinkFromArgs(argv: string[]): string | undefined {
  for (const arg of argv) {
    const url = normalizeDeepLink(arg)
    if (url) return url
  }
  return undefined
}

function consumeDeepLinkFromTaskParam(): string | undefined {
  const paramPath = path.join(taskDir(), 'param.txt')
  try {
    if (!existsSync(paramPath)) return undefined
    const url = normalizeDeepLink(readFileSync(paramPath, 'utf-8'))
    if (url) {
      writeFileSync(paramPath, 'empty')
    }
    return url
  } catch {
    return undefined
  }
}

function queueDeepLink(url: string): void {
  pendingDeepLink = url
  void flushPendingDeepLink()
}

async function flushPendingDeepLink(): Promise<void> {
  if (
    handlingPendingDeepLink ||
    !pendingDeepLink ||
    !coreReadyForDeepLinks
  ) {
    return
  }

  const url = pendingDeepLink
  pendingDeepLink = null
  handlingPendingDeepLink = true
  try {
    await handleDeepLink(url)
  } finally {
    handlingPendingDeepLink = false
    if (pendingDeepLink) {
      void flushPendingDeepLink()
    }
  }
}

app.on('second-instance', async (_event, commandline) => {
  const url = getDeepLinkFromArgs(commandline) ?? consumeDeepLinkFromTaskParam()
  if (url) {
    queueDeepLink(url)
  }
  await showMainWindow()
  void flushPendingDeepLink()
})

app.on('open-url', async (event, url) => {
  event.preventDefault()
  queueDeepLink(url)
  if (app.isReady()) {
    await showMainWindow()
    void flushPendingDeepLink()
  }
})

let isQuitting = false,
  notQuitDialog = false

let lastQuitAttempt = 0

export function setNotQuitDialog(): void {
  notQuitDialog = true
}

function showWindow(): number {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    } else if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focusOnWebView()
    mainWindow.setAlwaysOnTop(true, 'pop-up-menu')
    mainWindow.focus()
    mainWindow.setAlwaysOnTop(false)

    if (!mainWindow.isMinimized()) {
      return 100
    }
  }
  return 500
}

function showQuitConfirmDialog(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!mainWindow) {
      resolve(true)
      return
    }

    const delay = showWindow()
    setTimeout(() => {
      mainWindow?.webContents.send('show-quit-confirm')
      const handleQuitConfirm = (_event: Electron.IpcMainEvent, confirmed: boolean): void => {
        ipcMain.off('quit-confirm-result', handleQuitConfirm)
        resolve(confirmed)
      }
      ipcMain.once('quit-confirm-result', handleQuitConfirm)
    }, delay)
  })
}

app.on('window-all-closed', () => {
  // Don't quit app when all windows are closed
})

app.on('before-quit', async (e) => {
  if (!isQuitting && !notQuitDialog) {
    e.preventDefault()

    const now = Date.now()
    if (now - lastQuitAttempt < 500) {
      isQuitting = true
      if (quitTimeout) {
        clearTimeout(quitTimeout)
        quitTimeout = null
      }
      triggerSysProxy(false, false)
      await stopCore()
      app.exit()
      return
    }
    lastQuitAttempt = now

    const confirmed = await showQuitConfirmDialog()

    if (confirmed) {
      isQuitting = true
      if (quitTimeout) {
        clearTimeout(quitTimeout)
        quitTimeout = null
      }
      triggerSysProxy(false, false)
      await stopCore()
      app.exit()
    }
  } else if (notQuitDialog) {
    isQuitting = true
    if (quitTimeout) {
      clearTimeout(quitTimeout)
      quitTimeout = null
    }
    triggerSysProxy(false, false)
    await stopCore()
    app.exit()
  }
})

powerMonitor.on('shutdown', async () => {
  if (quitTimeout) {
    clearTimeout(quitTimeout)
    quitTimeout = null
  }
  triggerSysProxy(false, false)
  await stopCore()
  app.exit()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.guar.clash')
  try {
    await initPromise
  } catch (e) {
    dialog.showErrorBox(t('dialog.appInitFailed'), `${e}`)
    app.quit()
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  const appConfig = await getAppConfig()
  const { showFloatingWindow: showFloating = false, disableTray = false } = appConfig
  registerIpcMainHandlers()

  // Check process.argv for deep link URL (cold start on Windows/Linux)
  if (!pendingDeepLink) {
    const deepLinkArg = getDeepLinkFromArgs(process.argv) ?? consumeDeepLinkFromTaskParam()
    if (deepLinkArg) {
      queueDeepLink(deepLinkArg)
    }
  }

  if (process.platform === 'win32') {
    try {
      writeFileSync(path.join(taskDir(), 'param.txt'), 'empty')
    } catch {
      // ignore
    }
  }

  const createWindowPromise = createWindow(appConfig)

  let coreStarted = false

  const coreStartPromise = (async (): Promise<void> => {
    try {
      const [startPromise] = await startCore()
      startPromise.then(async () => {
        await initProfileUpdater()
      })
      coreStarted = true
      coreReadyForDeepLinks = true
      void flushPendingDeepLink()
    } catch (e) {
      showError(t('dialog.coreStartError'), `${e}`)
    }
  })()

  await createWindowPromise

  const uiTasks: Promise<void>[] = [initShortcut()]

  if (showFloating) {
    uiTasks.push(Promise.resolve(showFloatingWindow()))
  }
  if (!disableTray) {
    uiTasks.push(createTray())
  }

  await Promise.all(uiTasks)
  void checkForAppUpdates(mainWindow)

  await Promise.all([coreStartPromise])

  if (coreStarted) {
    mainWindow?.webContents.send('core-started')
  }

  if (needsFirstRunAdmin) {
    mainWindow?.webContents.send('needs-admin-setup')
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    showMainWindow()
  })
})

async function handleDeepLink(url: string): Promise<void> {
  if (!url.toLowerCase().startsWith('guar://')) return

  const urlObj = new URL(url)
  const action = (urlObj.host || urlObj.pathname.replace(/^\/+/, '')).toLowerCase()
  switch (action) {
    case 'install-config': {
      try {
        const profileUrl = urlObj.searchParams.get('url')
        const profileName = urlObj.searchParams.get('name')
        if (!profileUrl) {
          throw new Error(t('error.missingUrlParam'))
        }

        await addProfileItem({
          type: 'remote',
          name: profileName ?? undefined,
          url: profileUrl
        })
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
          mainWindow.webContents.send('profileConfigUpdated')
        }
        ipcMain.emit('updateTrayMenu')
        new Notification({ title: t('notification.profileImportSuccess') }).show()
      } catch (e) {
        const hwidLimitMatch = `${e}`.match(/HWID_LIMIT:(.*)/)
        if (hwidLimitMatch && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('show-hwid-limit-error', hwidLimitMatch[1].trim())
          return
        }
        showError(t('dialog.profileImportFailed'), `${e}`)
      }
      break
    }
  }
}

export async function createWindow(appConfig?: AppConfig): Promise<void> {
  if (isCreatingWindow) {
    if (createWindowPromise) {
      await createWindowPromise
    }
    return
  }
  isCreatingWindow = true
  createWindowPromise = new Promise<void>((resolve) => {
    createWindowPromiseResolve = resolve
  })
  try {
    const config = appConfig ?? (await getAppConfig())
    const { useWindowFrame = false } = config
    const windowLayout = getWindowLayout()

    const [mainWindowState] = await Promise.all([
      Promise.resolve(
        windowStateKeeper({
          defaultWidth: windowLayout.width,
          defaultHeight: windowLayout.height,
          file: 'window-state.json'
        })
      ),
      process.platform === 'darwin'
        ? createApplicationMenu()
        : Promise.resolve(Menu.setApplicationMenu(null))
    ])
    mainWindow = new BrowserWindow({
      minWidth: windowLayout.width,
      minHeight: windowLayout.height,
      maxWidth: windowLayout.width,
      maxHeight: windowLayout.height,
      width: windowLayout.width,
      height: windowLayout.height,
      x: undefined,
      y: undefined,
      center: true,
      show: false,
      frame: useWindowFrame,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      titleBarStyle: useWindowFrame ? 'default' : 'hidden',
      titleBarOverlay: false,
      autoHideMenuBar: true,
      ...(process.platform === 'win32'
        ? { icon: icoIcon }
        : process.platform === 'linux'
          ? { icon: pngIcon }
          : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        spellcheck: false,
        sandbox: false
      }
    })
    mainWindowState.manage(mainWindow)
    if (process.platform === 'darwin' && !useWindowFrame) {
      mainWindow.setWindowButtonVisibility(false)
    }
    mainWindow.on('ready-to-show', async () => {
      const { silentStart = false } = await getAppConfig()
      if (!silentStart || pendingDeepLink) {
        if (quitTimeout) {
          clearTimeout(quitTimeout)
        }
        windowShown = true
        mainWindow?.show()
        mainWindow?.focusOnWebView()
      } else {
        await scheduleLightweightMode()
      }
    })
    mainWindow.webContents.on('did-fail-load', () => {
      mainWindow?.webContents.reload()
    })

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return
      if (!mainWindow || mainWindow.isDestroyed()) return
      try {
        mainWindow.webContents.reload()
      } catch {
        // ignore
      }
    })

    mainWindow.webContents.on('unresponsive', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      try {
        mainWindow.webContents.forcefullyCrashRenderer()
        mainWindow.webContents.reload()
      } catch {
        // ignore
      }
    })

    mainWindow.on('focus', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      try {
        mainWindow.webContents.invalidate()
      } catch {
        // ignore
      }
    })

    mainWindow.on('show', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      try {
        mainWindow.webContents.invalidate()
      } catch {
        // ignore
      }
    })

    mainWindow.webContents.on('did-finish-load', () => {
      void flushPendingDeepLink()
    })

    mainWindow.on('close', async (event) => {
      event.preventDefault()
      mainWindow?.hide()
      if (windowShown) {
        await scheduleLightweightMode()
      }
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    mainWindow.on('resized', () => {
      if (mainWindow) mainWindowState.saveState(mainWindow)
    })

    mainWindow.on('move', () => {
      if (mainWindow) mainWindowState.saveState(mainWindow)
    })

    mainWindow.on('session-end', async () => {
      triggerSysProxy(false, false)
      await stopCore()
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
  } finally {
    isCreatingWindow = false
    if (createWindowPromiseResolve) {
      createWindowPromiseResolve()
      createWindowPromiseResolve = null
    }
    createWindowPromise = null
  }
}

export async function triggerMainWindow(): Promise<void> {
  if (mainWindow && mainWindow.isVisible()) {
    closeMainWindow()
  } else {
    await showMainWindow()
  }
}

export async function showMainWindow(): Promise<void> {
  if (quitTimeout) {
    clearTimeout(quitTimeout)
  }
  if (process.platform === 'darwin' && app.dock) {
    const { useDockIcon = true } = await getAppConfig()
    if (!useDockIcon) {
      app.dock.hide()
    }
  }
  if (mainWindow) {
    windowShown = true
    mainWindow.show()
    mainWindow.focusOnWebView()
  } else {
    await createWindow()
    if (mainWindow !== null) {
      windowShown = true
      ;(mainWindow as BrowserWindow).show()
      ;(mainWindow as BrowserWindow).focusOnWebView()
    }
  }
}

export function closeMainWindow(): void {
  if (mainWindow) {
    mainWindow.close()
  }
}
