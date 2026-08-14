import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'
import { join } from 'path'

let configEditorWindow: BrowserWindow | null = null

export async function openConfigEditor(profileId: string): Promise<void> {
  if (configEditorWindow && !configEditorWindow.isDestroyed()) {
    configEditorWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 480,
    minHeight: 360,
    show: false,
    title: 'GUAR Clash — Config Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      spellcheck: false,
      sandbox: false
    }
  })
  configEditorWindow = win
  win.on('closed', () => {
    configEditorWindow = null
  })
  win.once('ready-to-show', () => win.show())
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/config-editor.html?id=${encodeURIComponent(profileId)}`)
  } else {
    await win.loadFile(join(__dirname, '../renderer/config-editor.html'), { query: { id: profileId } })
  }
}
