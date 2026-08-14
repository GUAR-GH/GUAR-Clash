import { mihomoProfileWorkDir, mihomoWorkDir, profileConfigPath, profilePath, rulePath } from '../utils/dirs'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { restartCore } from '../core/manager'
import { getRuntimeConfig } from '../core/factory'
import { mihomoHotReloadConfig } from '../core/mihomoApi'
import { getAppConfig } from './app'
import { existsSync } from 'fs'
import axios, { AxiosResponse } from 'axios'
import https from 'https'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { defaultProfile } from '../utils/template'
import { dirname, join } from 'path'
import { deepMerge } from '../utils/merge'
import { getUserAgent } from '../utils/userAgent'
import { getHWID, getDeviceOS, getOSVersion, getDeviceModel } from '../utils/deviceInfo'
import { t } from '../utils/i18n'

// Фиксированные слоты профилей правил:
// слот 1 = единственная подписка (remote, locked), слоты 2/3 = локальные копии для ручного редактирования
export const SUBSCRIPTION_SLOT = 'profile-1'
export const COPY_SLOTS = ['profile-2', 'profile-3']
export const SLOT_IDS = [SUBSCRIPTION_SLOT, ...COPY_SLOTS]

let profileConfig: ProfileConfig // profile.yaml

export async function getProfileConfig(force = false): Promise<ProfileConfig> {
  if (force || !profileConfig) {
    const data = await readFile(profileConfigPath(), 'utf-8')
    profileConfig = parseYaml(data) || { items: [] }
  }
  if (typeof profileConfig !== 'object') profileConfig = { items: [] }
  return profileConfig
}

export async function setProfileConfig(config: ProfileConfig): Promise<void> {
  profileConfig = config
  await writeFile(profileConfigPath(), stringifyYaml(config), 'utf-8')
}

export async function getProfileItem(id: string | undefined): Promise<ProfileItem | undefined> {
  const { items } = await getProfileConfig()
  if (!id || id === 'default') return { id: 'default', type: 'local', name: t('ui.blankSubscription') }
  return items?.find((item) => item.id === id)
}

export async function changeCurrentProfile(id: string): Promise<void> {
  const config = await getProfileConfig()
  const current = config.current
  config.current = id
  await setProfileConfig(config)
  try {
    const { useHotReloadProfile = true } = await getAppConfig()
    if (useHotReloadProfile) {
      await mihomoHotReloadConfig()
    } else {
      await restartCore()
    }
  } catch (e) {
    config.current = current
    throw e
  } finally {
    await setProfileConfig(config)
  }
}

export async function setCurrentProfile(id: string): Promise<void> {
  const config = await getProfileConfig()
  config.current = id
  await setProfileConfig(config)
}

export async function validateProfile(
  id: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await getProfileStr(id)
    const parsed = parseYaml(data)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: t('error.subscriptionFormatError') }
    }
    const hasContent =
      'proxies' in parsed ||
      'proxy-providers' in parsed ||
      'proxy-groups' in parsed ||
      'rules' in parsed ||
      'rule-providers' in parsed ||
      'dns' in parsed ||
      'tun' in parsed ||
      'mixed-port' in parsed
    if (!hasContent) {
      return { ok: false, error: t('error.subscriptionFormatError') }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateProfileItem(item: ProfileItem): Promise<void> {
  const config = await getProfileConfig()
  const index = (config.items ?? []).findIndex((i) => i.id === item.id)
  if (index === -1) {
    throw new Error('Profile not found')
  }
  config.items[index] = item
  await setProfileConfig(config)
}

export async function addProfileItem(item: Partial<ProfileItem>): Promise<void> {
  const isRemote = item.type === 'remote'
  if (isRemote) {
    // Единая подписка: remote всегда живёт в фиксированном слоте profile-1
    item = { ...item, id: SUBSCRIPTION_SLOT }
  }
  const newItem = await createProfile(item)
  if (isRemote) {
    ;(newItem as ProfileItem).locked = true
  }
  const config = await getProfileConfig()
  const isExisting = !!(await getProfileItem(newItem.id))
  if (isExisting) {
    await updateProfileItem(newItem)
  } else {
    if (!config.items) config.items = []
    config.items.push(newItem)
    await setProfileConfig(config)
  }

  if (isRemote) {
    // При обновлении подписки: инициализируем пустые слоты 2/3 и сбрасываем активный на слот 1,
    // чтобы перезапись конфига новыми правилами не затёрла правки пользователя в 2/3.
    await ensureCopySlots()
    await changeCurrentProfile(SUBSCRIPTION_SLOT)
  } else if (!config.current) {
    await changeCurrentProfile(newItem.id)
  }
}

// Гарантирует наличие слотов 2/3 (локальные копии), но только если уже есть подписка (слот 1).
// Если файл слота пуст/отсутствует — копирует содержимое файла подписки. Иначе не трогает (сохраняет правки пользователя).
export async function ensureCopySlots(): Promise<void> {
  const config = await getProfileConfig()
  if (!config.items) config.items = []
  const hasSubscription = config.items.some(
    (i) => i.id === SUBSCRIPTION_SLOT && i.type === 'remote'
  )
  if (!hasSubscription) return // нет подписки — не создаём слоты, сохраняем first-run empty state
  const subFile = profilePath(SUBSCRIPTION_SLOT)
  const hasSub = existsSync(subFile)
  for (const slotId of COPY_SLOTS) {
    if (!config.items.some((i) => i.id === slotId)) {
      config.items.push({
        id: slotId,
        type: 'local',
        name: slotId === COPY_SLOTS[0] ? 'Profile 2' : 'Profile 3',
        file: '',
        updated: Date.now()
      } as ProfileItem)
    }
    if (hasSub) {
      const slotFile = profilePath(slotId)
      let empty = true
      if (existsSync(slotFile)) {
        const content = await readFile(slotFile, 'utf-8')
        empty = content.trim() === ''
      }
      if (empty) {
        const content = await readFile(subFile, 'utf-8')
        await writeFile(slotFile, content, 'utf-8')
      }
    }
  }
  await setProfileConfig(config)
}

// Миграция на модель 3 фиксированных слотов для существующих пользователей.
// Если подписки ещё нет — ничего не делаем, сохраняем штатное first-run состояние.
export async function migrateProfileSlots(): Promise<void> {
  const config = await getProfileConfig(true)
  if (!config.items) config.items = []
  const remotes = config.items.filter((i) => i.type === 'remote')
  if (remotes.length === 0) return
  const sub = remotes[0]
  if (sub.id !== SUBSCRIPTION_SLOT) {
    const oldFile = profilePath(sub.id)
    const newFile = profilePath(SUBSCRIPTION_SLOT)
    if (existsSync(oldFile) && !existsSync(newFile)) {
      await rename(oldFile, newFile)
    } else if (existsSync(oldFile) && existsSync(newFile)) {
      await rm(oldFile)
    }
    sub.id = SUBSCRIPTION_SLOT
  }
  sub.locked = true
  // Лишние remote (legacy) — оставляем только один (слот подписки)
  config.items = config.items.filter((i) => i.type !== 'remote' || i.id === SUBSCRIPTION_SLOT)
  await setProfileConfig(config)
  await ensureCopySlots()
  const cfg2 = await getProfileConfig()
  if (!cfg2.current || !cfg2.items.some((i) => i.id === cfg2.current)) {
    cfg2.current = SUBSCRIPTION_SLOT
    await setProfileConfig(cfg2)
  }
}
export async function removeProfileItem(id: string): Promise<void> {
  const config = await getProfileConfig()
  config.items = config.items?.filter((item) => item.id !== id)
  let shouldRestart = false
  if (config.current === id) {
    shouldRestart = true
    if (config.items && config.items.length > 0) {
      config.current = config.items[0].id
    } else {
      config.current = undefined
    }
  }
  await setProfileConfig(config)
  if (existsSync(profilePath(id))) {
    await rm(profilePath(id))
  }
  if (shouldRestart) {
    const { useHotReloadProfile = false } = await getAppConfig()
    if (useHotReloadProfile) {
      try {
        await mihomoHotReloadConfig()
        return
      } catch {
        // fall back to restart
      }
    }
    await restartCore()
  }
  if (existsSync(mihomoProfileWorkDir(id))) {
    await rm(mihomoProfileWorkDir(id), { recursive: true })
  }
}

export async function getCurrentProfileItem(): Promise<ProfileItem> {
  const { current } = await getProfileConfig()
  return (await getProfileItem(current)) || { id: 'default', type: 'local', name: t('ui.blankSubscription') }
}

async function downloadLogoAsBase64(
  logoUrl: string,
  proxy?: { protocol: string; host: string; port: number }
): Promise<string | null> {
  try {
    const httpsAgent = new https.Agent()
    const res = await axios.get(logoUrl, {
      httpsAgent,
      ...(proxy && { proxy }),
      responseType: 'arraybuffer',
      timeout: 10000
    })
    const contentType = res.headers['content-type'] || 'image/png'
    const base64 = Buffer.from(res.data).toString('base64')
    return `data:${contentType};base64,${base64}`
  } catch {
    return null
  }
}

export async function createProfile(item: Partial<ProfileItem>): Promise<ProfileItem> {
  const id = item.id || new Date().getTime().toString(16)
  const newItem = {
    id,
    name: item.name || (item.type === 'remote' ? 'Remote File' : 'Local File'),
    type: item.type,
    url: item.url,
    ua: item.ua,
    verify: item.verify ?? true,
    autoUpdate: item.autoUpdate ?? true,
    interval: item.interval || 0,
    useProxy: item.useProxy || false,
    updated: new Date().getTime()
  } as ProfileItem
  switch (newItem.type) {
    case 'remote': {
      const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
      if (!item.url) throw new Error('Empty URL')
      let res: AxiosResponse
      try {
        const httpsAgent = new https.Agent()

        res = await axios.get(item.url, {
          httpsAgent,
          ...(newItem.useProxy &&
            mixedPort && {
              proxy: { protocol: 'http', host: '127.0.0.1', port: mixedPort }
            }),
          headers: {
            'User-Agent': newItem.ua || (await getUserAgent()),
            'x-hwid': getHWID(),
            'x-device-os': getDeviceOS(),
            'x-ver-os': getOSVersion(),
            'x-device-model': getDeviceModel()
          },
          responseType: 'text'
        })
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
            throw new Error(`${t('error.networkResetOrTimeout')}：${item.url}`)
          } else if (error.code === 'CERT_HAS_EXPIRED') {
            throw new Error(`${t('error.serverCertExpired')}：${item.url}`)
          } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
            throw new Error(`${t('error.unableToVerifyCert')}：${item.url}`)
          } else if (error.message.includes('Certificate verification failed')) {
            throw new Error(`${t('error.certVerificationFailed')}：${item.url}`)
          } else {
            throw new Error(`${t('error.requestFailed')}：${error.message}`)
          }
        }
        throw error
      }


      const data = res.data
      const headers = res.headers
      const contentType = String(headers['content-type'] ?? '').toLowerCase()
      if (contentType.includes('text/html') || contentType.includes('text/xml')) {
        throw new Error(t('error.subscriptionFormatError'))
      }
      const hwidLimitKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('x-hwid-limit')
      )
      if (hwidLimitKey && headers[hwidLimitKey] === 'true') {
        const hwidSupportKey = Object.keys(headers).find((k) =>
          k.toLowerCase().endsWith('support-url')
        )
        const hwidSupportUrl = hwidSupportKey ? headers[hwidSupportKey] : ''
        throw new Error(`HWID_LIMIT:${hwidSupportUrl}`)
      }
      const profileTitleKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('profile-title')
      )
      if (profileTitleKey) {
        const titleValue = headers[profileTitleKey]
        if (titleValue.startsWith('base64:')) {
          newItem.name = Buffer.from(titleValue.slice(7), 'base64').toString('utf-8')
        } else {
          newItem.name = titleValue
        }
      } else {
        const contentDispositionKey = Object.keys(headers).find((k) =>
          k.toLowerCase().endsWith('content-disposition')
        )
        if (contentDispositionKey && newItem.name === 'Remote File') {
          newItem.name = parseFilename(headers[contentDispositionKey])
        }
      }
      const homeKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('profile-web-page-url')
      )
      if (homeKey) {
        newItem.home = headers[homeKey]
      }
      const intervalKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('profile-update-interval')
      )
      if (intervalKey) {
        newItem.interval = parseInt(headers[intervalKey]) * 60
        if (newItem.interval) {
          newItem.locked = true
        }
      }
      const userinfoKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('subscription-userinfo')
      )
      if (userinfoKey) {
        newItem.extra = parseSubinfo(headers[userinfoKey])
      }
      const logoKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('profile-logo')
      )
      if (logoKey) {
        const logoUrl = headers[logoKey]
        const proxyConfig =
          newItem.useProxy && mixedPort
            ? { protocol: 'http', host: '127.0.0.1', port: mixedPort }
            : undefined
        const base64Logo = await downloadLogoAsBase64(logoUrl, proxyConfig)
        newItem.logo = base64Logo || logoUrl
      }
      const supportUrlKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('support-url')
      )
      if (supportUrlKey) {
        newItem.supportUrl = headers[supportUrlKey]
      }
      const announceKey = Object.keys(headers).find((k) =>
        k.toLowerCase().endsWith('announce')
      )
      if (announceKey) {
        const announceValue = headers[announceKey]
        const decoded = announceValue.startsWith('base64:')
          ? Buffer.from(announceValue.slice(7), 'base64').toString('utf-8')
          : announceValue
        newItem.announce = decoded.replace(/\\n/g, '\n')
      }
      if (newItem.verify) {
        let parsed: MihomoConfig
        try {
          parsed = parseYaml<MihomoConfig>(data)
        } catch (error) {
          throw new Error(t('error.subscriptionFormatError') + '\n' + (error as Error).message)
        }
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed) ||
          !(
            'proxies' in parsed ||
            'proxy-providers' in parsed ||
            'proxy-groups' in parsed ||
            'rules' in parsed ||
            'rule-providers' in parsed ||
            'dns' in parsed ||
            'tun' in parsed ||
            'mixed-port' in parsed
          )
        ) {
          throw new Error(t('error.subscriptionFormatError'))
        }
      }
      await setProfileStr(id, data)
      break
    }
    case 'local': {
      const data = item.file || ''
      await setProfileStr(id, data)
      break
    }
  }
  return newItem
}

export async function getProfileStr(id: string | undefined): Promise<string> {
  if (existsSync(profilePath(id || 'default'))) {
    return await readFile(profilePath(id || 'default'), 'utf-8')
  } else {
    return stringifyYaml(defaultProfile)
  }
}

export async function getProfileParseStr(id: string | undefined): Promise<string> {
  let data: string
  if (existsSync(profilePath(id || 'default'))) {
    data = await readFile(profilePath(id || 'default'), 'utf-8')
  } else {
    data = stringifyYaml(defaultProfile)
  }
  const profile = deepMerge(parseYaml<object>(data), {})
  return stringifyYaml(profile)
}

export async function setProfileStr(id: string, content: string): Promise<void> {
  const { current } = await getProfileConfig()
  await writeFile(profilePath(id), content, 'utf-8')
  if (current === id) {
    const { useHotReloadProfile = true } = await getAppConfig()
    if (useHotReloadProfile) {
      try {
        await mihomoHotReloadConfig()
        return
      } catch {
        // fall back to restart
      }
    }
    await restartCore()
  }
}

export async function getProfile(id: string | undefined): Promise<MihomoConfig> {
  const profile = await getProfileStr(id)
  let result = parseYaml<MihomoConfig>(profile)
  if (typeof result !== 'object') result = {} as MihomoConfig
  return result
}

// attachment;filename=xxx.yaml; filename*=UTF-8''%xx%xx%xx
function parseFilename(str: string): string {
  if (str.match(/filename\*=.*''/)) {
    return decodeURIComponent(str.split(/filename\*=.*''/)[1])
  } else {
    return str.split('filename=')[1]
  }
}

// subscription-userinfo: upload=1234; download=2234; total=1024000; expire=2218532293
function parseSubinfo(str: string): SubscriptionUserInfo {
  const parts = str.split(';')
  const obj = {} as SubscriptionUserInfo
  parts.forEach((part) => {
    const [key, value] = part.trim().split('=')
    obj[key] = parseInt(value)
  })
  return obj
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:\\/.test(path)
}

export async function getFileStr(path: string): Promise<string> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  if (isAbsolutePath(path)) {
    return await readFile(path, 'utf-8')
  } else {
    return await readFile(
      join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), path),
      'utf-8'
    )
  }
}

export async function setFileStr(path: string, content: string): Promise<void> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  if (isAbsolutePath(path)) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf-8')
  } else {
    const target = join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf-8')
  }
}

export async function getRuleStr(id: string): Promise<string> {
  return await readFile(rulePath(id), 'utf-8')
}

export async function setRuleStr(id: string, str: string): Promise<void> {
  await writeFile(rulePath(id), str, 'utf-8')
}

export async function convertMrsRuleset(filePath: string, behavior: string): Promise<string> {
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execAsync = promisify(exec)
  const { mihomoCorePath } = await import('../utils/dirs')
  const { getAppConfig } = await import('./app')
  const { tmpdir } = await import('os')
  const { randomBytes } = await import('crypto')
  const { unlink } = await import('fs/promises')

  const { core = 'mihomo' } = await getAppConfig()
  const corePath = mihomoCorePath(core)
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  let fullPath: string
  if (isAbsolutePath(filePath)) {
    fullPath = filePath
  } else {
    fullPath = join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), filePath)
  }

  const tempFileName = `mrs-convert-${randomBytes(8).toString('hex')}.txt`
  const tempFilePath = join(tmpdir(), tempFileName)

  try {
    // 使用 mihomo convert-ruleset 命令转换 MRS 文件为 text 格式
    // 命令格式: mihomo convert-ruleset <behavior> <format> <source>
    await execAsync(`"${corePath}" convert-ruleset ${behavior} mrs "${fullPath}" "${tempFilePath}"`)
    const content = await readFile(tempFilePath, 'utf-8')
    await unlink(tempFilePath)

    return content
  } catch (error) {
    try {
      await unlink(tempFilePath)
    } catch {
      // ignore
    }
    throw error
  }
}
