import { app, BrowserWindow, dialog, net, shell, type MessageBoxOptions } from 'electron'
import { t } from '../utils/i18n'

const UPDATE_REPO = 'GUAR-GH/GUAR-Clash'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
const MAX_CHANGELOG_LENGTH = 1800

interface GithubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GithubRelease {
  tag_name: string
  name?: string
  body?: string
  html_url: string
  draft?: boolean
  prerelease?: boolean
  assets?: GithubReleaseAsset[]
}

interface ParsedVersion {
  numbers: number[]
  prerelease: string
}

function parseVersion(version: string): ParsedVersion | undefined {
  const normalized = version.trim().replace(/^v/i, '')
  const [main, prerelease = ''] = normalized.split('-', 2)
  const parts = main.split('.')

  if (parts.length < 2 || parts.length > 3) return undefined

  const numbers = parts.map((part) => Number.parseInt(part, 10))
  if (numbers.some((part) => Number.isNaN(part))) return undefined

  while (numbers.length < 3) {
    numbers.push(0)
  }

  return { numbers, prerelease }
}

function compareVersions(current: string, latest: string): number {
  const currentVersion = parseVersion(current)
  const latestVersion = parseVersion(latest)

  if (!currentVersion || !latestVersion) return 0

  for (let i = 0; i < 3; i++) {
    const diff = latestVersion.numbers[i] - currentVersion.numbers[i]
    if (diff !== 0) return diff
  }

  if (currentVersion.prerelease && !latestVersion.prerelease) return 1
  if (!currentVersion.prerelease && latestVersion.prerelease) return -1

  return latestVersion.prerelease.localeCompare(currentVersion.prerelease)
}

function pickDownloadUrl(release: GithubRelease): string {
  const assets = release.assets ?? []
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const platformMatchers =
    process.platform === 'win32'
      ? [`${arch}-setup.exe`, 'setup.exe']
      : process.platform === 'darwin'
        ? [`${arch}.pkg`, '.pkg']
        : [process.arch === 'arm64' ? 'arm64.deb' : 'amd64.deb', '.deb', '.rpm']

  for (const matcher of platformMatchers) {
    const asset = assets.find((item) => {
      const name = item.name.toLowerCase()
      return (
        name.includes(matcher) &&
        !name.endsWith('.blockmap') &&
        !name.endsWith('.sha256')
      )
    })
    if (asset) return asset.browser_download_url
  }

  return release.html_url
}

function formatChangelog(body: string | undefined): string {
  if (!body) return ''
  const normalized = body.trim()
  if (normalized.length <= MAX_CHANGELOG_LENGTH) return normalized
  return `${normalized.slice(0, MAX_CHANGELOG_LENGTH).trimEnd()}\n...`
}

async function fetchLatestRelease(): Promise<GithubRelease | undefined> {
  const response = await net.fetch(LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'GUAR-Clash'
    }
  })

  if (!response.ok) return undefined

  const release = (await response.json()) as GithubRelease
  if (!release || release.draft || release.prerelease || !release.tag_name) return undefined

  return release
}

export async function checkForAppUpdates(parent?: BrowserWindow | null): Promise<void> {
  if (!app.isPackaged) return

  try {
    const release = await fetchLatestRelease()
    if (!release) return

    const currentVersion = app.getVersion()
    const latestVersion = release.tag_name.replace(/^v/i, '')
    if (compareVersions(currentVersion, latestVersion) <= 0) return

    const changelog = formatChangelog(release.body)
    const options: MessageBoxOptions = {
      type: 'info',
      title: t('dialog.updateAvailable'),
      message: `${t('dialog.updateAvailable')}: ${latestVersion}`,
      detail: [
        `${t('dialog.currentVersion')}: ${currentVersion}`,
        `${t('dialog.latestVersion')}: ${latestVersion}`,
        changelog
      ].filter(Boolean).join('\n\n'),
      buttons: [t('dialog.downloadUpdate'), t('dialog.later')],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }

    const result =
      parent && !parent.isDestroyed()
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options)

    if (result.response === 0) {
      await shell.openExternal(pickDownloadUrl(release))
    }
  } catch {
    // Update checks must never interrupt normal app startup.
  }
}
