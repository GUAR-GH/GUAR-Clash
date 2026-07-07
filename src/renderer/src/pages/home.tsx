import { toast } from 'sonner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { triggerSysProxy, updateTrayIcon, mihomoHotReloadConfig } from '@renderer/utils/ipc'
import NumberFlow from '@number-flow/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { WifiOff, ChevronRight, ArrowUp, ArrowDown, PowerIcon, PauseIcon } from 'lucide-react'
import { Spinner } from '@renderer/components/ui/spinner'
import { CharacterMorph } from '@renderer/components/ui/character-morph'
import { calcTraffic } from '@renderer/utils/calc'
import { useTrafficStore } from '@renderer/store/traffic-store'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

// Module-level variable: persists across component mounts/unmounts
let connectionStartTime: number | null = null

const Home: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false
  } = appConfig || {}
  const { enable: writeSysProxy = true, mode: sysProxyMode } = sysProxy || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { tun, mode: outboundMode = 'rule' } = controledMihomoConfig || {}
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const sysProxyDisabled = mixedPort == 0

  const { profileConfig } = useProfileConfig()
  const { groups } = useGroups()
  const navigate = useNavigate()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0

  const trafficInfo = useTrafficStore((s) => s.traffic)

  const [loading, setLoading] = useState(false)
  const [loadingDirection, setLoadingDirection] = useState<'connecting' | 'disconnecting'>(
    'connecting'
  )

  const [elapsed, setElapsed] = useState(() => {
    if (connectionStartTime !== null) {
      return Math.floor((Date.now() - connectionStartTime) / 1000)
    }
    return 0
  })

  const isSelected = (tun?.enable ?? false) || proxyMode

  useEffect(() => {
    if (isSelected) {
      if (connectionStartTime === null) {
        connectionStartTime = Date.now()
      }
      setElapsed(Math.floor((Date.now() - connectionStartTime) / 1000))
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - connectionStartTime!) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    } else {
      connectionStartTime = null
      setElapsed(0)
      return undefined
    }
  }, [isSelected])

  const isDisabled =
    loading ||
    (mainSwitchMode === 'sysproxy' && writeSysProxy && sysProxyMode == 'manual' && sysProxyDisabled)

  const status = loading
    ? loadingDirection === 'connecting'
      ? t('pages.home.connecting')
      : t('pages.home.disconnecting')
    : isSelected
      ? t('pages.home.connected')
      : t('pages.home.disconnected')
  const statusWidthTexts = [
    t('pages.home.connecting'),
    t('pages.home.disconnecting'),
    t('pages.home.connected'),
    t('pages.home.disconnected')
  ]
  const showConnectedTimer = !loading && isSelected
  const elapsedHours = Math.floor(elapsed / 3600)
  const elapsedMinutes = Math.floor((elapsed % 3600) / 60)
  const elapsedSeconds = elapsed % 60

  // Current profile & subscription
  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])

  const subscription = currentProfile?.extra
  const trafficUsed = (subscription?.upload ?? 0) + (subscription?.download ?? 0)
  const trafficTotal = subscription?.total ?? 0
  const trafficRemaining = trafficTotal > 0 ? trafficTotal - trafficUsed : 0
  const expireTimestamp = subscription?.expire ?? 0
  const expireDate =
    expireTimestamp > 0 ? dayjs.unix(expireTimestamp).format('L') : t('pages.home.never')

  const firstGroup = groups?.[0]
  const supportUrl = currentProfile?.supportUrl
  const supportHref = useMemo(() => {
    if (!supportUrl) return undefined
    try {
      return new URL(supportUrl).toString()
    } catch {
      return undefined
    }
  }, [supportUrl])

  useEffect(() => {
    if (outboundMode !== 'global') return
    patchControledMihomoConfig({ mode: 'rule' })
      .then(() => mihomoHotReloadConfig())
      .then(() => {
        window.electron.ipcRenderer.send('updateTrayMenu')
      })
      .catch(() => {
        // If core is still booting, the next normal reload will use rule mode from config.
      })
  }, [outboundMode, patchControledMihomoConfig])

  const onValueChange = async (enable: boolean): Promise<void> => {
    setLoading(true)
    setLoadingDirection(enable ? 'connecting' : 'disconnecting')
    try {
      if (enable) {
        if (mainSwitchMode === 'tun') {
          await patchControledMihomoConfig({ tun: { enable: true }, dns: { enable: true } })
          await mihomoHotReloadConfig()
        } else {
          if (writeSysProxy && sysProxyMode == 'manual' && sysProxyDisabled) return
          await patchAppConfig({ proxyMode: true })
          await mihomoHotReloadConfig()
          if (writeSysProxy) {
            await triggerSysProxy(true, onlyActiveDevice)
          }
        }
      } else {
        const tunWasEnabled = tun?.enable ?? false
        const proxyModeWasEnabled = proxyMode
        if (tunWasEnabled) {
          await patchControledMihomoConfig({ tun: { enable: false } })
        }
        if (proxyModeWasEnabled) {
          if (writeSysProxy) {
            await triggerSysProxy(false, onlyActiveDevice)
          }
          await patchAppConfig({ proxyMode: false })
        }
        if (tunWasEnabled || proxyModeWasEnabled) {
          await mihomoHotReloadConfig()
        }
      }
      window.electron.ipcRenderer.send('updateFloatingWindow')
      window.electron.ipcRenderer.send('updateTrayMenu')
      await updateTrayIcon()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <BasePage>
      {!hasProfiles ? (
        <div className="h-full w-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-75 p-7 text-center">
            <WifiOff className="size-16 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground">
              {t('pages.profiles.emptyTitle')}
            </h2>
            <p className="text-sm font-medium text-muted-foreground text-center">
              {t('pages.profiles.emptyDescription')}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] px-3 pb-3">
          {currentProfile && (
            <div className="px-0.5 pt-3">
              <div
                data-guide="home-profile-header"
                className="flex min-w-0 items-center justify-center gap-3"
              >
                {currentProfile.logo && (
                  <img
                    src={currentProfile.logo}
                    alt=""
                    className="size-11 rounded-full object-cover shrink-0"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <div className="min-w-0 text-center">
                  <div className="truncate text-xl font-semibold leading-tight text-foreground">
                    {currentProfile.name}
                  </div>
                  {supportHref && (
                    <button
                      data-guide="home-support-link"
                      type="button"
                      onClick={() => open(supportHref)}
                      className="mt-1 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:text-foreground/90"
                    >
                      support
                    </button>
                  )}
                </div>
              </div>
              {subscription && (
                <div className="mt-3 border-t border-stroke/65 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-xs text-muted-foreground">
                        {t('pages.home.trafficRemaining')}
                      </span>
                      <span className="text-base font-semibold text-foreground">
                        {trafficTotal > 0
                          ? formatBytes(trafficRemaining)
                          : t('pages.home.unlimited')}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-xs text-muted-foreground">
                        {t('pages.home.expires')}
                      </span>
                      <span className="text-base font-semibold text-foreground">{expireDate}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex min-h-0 translate-y-[9px] flex-col items-center justify-center py-3">
            <div className="mb-3 flex h-6 items-center justify-center">
              <CharacterMorph
                texts={[status]}
                reserveTexts={statusWidthTexts}
                interval={3000}
                className="h-6 leading-none text-foreground font-semibold"
              />
            </div>
            <button
              disabled={isDisabled}
              onClick={() => onValueChange(!isSelected)}
              data-guide="home-power-toggle"
              className="relative group transition-transform active:scale-95 cursor-pointer"
            >
              <div
                className={`size-[7.5rem] rounded-full flex items-center justify-center transition-all duration-300 border backdrop-blur-2xl shadow-[0_18px_48px_rgba(217,70,239,0.18)] ${
                  isSelected
                    ? 'bg-linear-to-br from-gradient-start-power-on/80 to-gradient-end-power-on/80 border-stroke-power-on'
                    : 'bg-foreground text-background border-foreground/30 hover:brightness-110'
                } ${loading ? 'animate-none' : ''}`}
              >
                <div className="relative size-16">
                  <Spinner
                    className={`absolute inset-0 m-auto size-16 text-[#FAFAFA] transition-all duration-300 ease-out ${
                      loading ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                  <PauseIcon
                    className={`absolute inset-0 size-16 stroke-[2.6] text-white transition-all duration-300 ease-out ${
                      !loading && isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                  <PowerIcon
                    className={`absolute inset-0 size-16 stroke-[2.6] transition-all duration-300 ease-out ${
                      !loading && !isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                </div>
              </div>
            </button>
            <div className="mt-3 h-8 flex items-center justify-center">
              <div
                aria-hidden={!showConnectedTimer}
                className={`inline-flex items-center gap-0.5 text-base font-bold text-foreground tabular-nums transition-all duration-300 ease-out ${
                  showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                }`}
              >
                <NumberFlow
                  value={elapsedHours}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
                <span>:</span>
                <NumberFlow
                  value={elapsedMinutes}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
                <span>:</span>
                <NumberFlow
                  value={elapsedSeconds}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
              </div>
            </div>
            <div
              aria-hidden={!showConnectedTimer}
              className={`mt-2 flex items-center gap-4 tabular-nums transition-all duration-300 ease-out ${
                showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowUp className="size-3.5 text-stroke-power-on" />
                <span>{calcTraffic(trafficInfo.upTotal)}</span>
              </div>
              <div className="h-3 w-px bg-stroke" />
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowDown className="size-3.5 text-stroke-power-on" />
                <span>{calcTraffic(trafficInfo.downTotal)}</span>
              </div>
            </div>
          </div>

          <div className="px-0.5 pt-3">
            {firstGroup && (
              <div className="border-t border-stroke/65 pt-2">
                <button
                  data-guide="home-group-selector"
                  type="button"
                  className="flex w-full items-center justify-center gap-2 py-2 text-center transition-colors hover:text-foreground/90"
                  onClick={() => navigate('/proxies', { state: { fromHome: true } })}
                >
                  <div className="flag-emoji max-w-full truncate text-center text-sm font-medium text-foreground">
                    {firstGroup.now || firstGroup.name}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </BasePage>
  )
}

export default Home
