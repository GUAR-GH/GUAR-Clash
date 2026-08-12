import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { platform } from '@renderer/utils/init'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import {
  checkAutoRun,
  disableAutoRun,
  enableAutoRun,
  patchMihomoConfig,
  mihomoCloseAllConnections,
  openFile,
  setNativeTheme
} from '@renderer/utils/ipc'
import useSWR from 'swr'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Switch } from '@renderer/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Settings, RefreshCcw, Trash2, Moon, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'

// Фиксированные слоты профилей (должны совпадать с main/config/profile.ts)
const SUBSCRIPTION_SLOT = 'profile-1'
const SLOT_IDS = ['profile-1', 'profile-2', 'profile-3']

interface SegOption {
  value: string
  label: string
}

const Segmented: React.FC<{
  value: string
  options: SegOption[]
  onChange: (v: string) => void
}> = ({ value, options, onChange }) => (
  <div className="flex gap-0.5 rounded-md bg-accent/40 p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (o.value !== value) onChange(o.value)
        }}
        className={`h-6 min-w-6 px-2 text-xs rounded-[5px] transition-colors ${
          value === o.value
            ? 'bg-foreground/90 text-background font-medium'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
)

const WindowControls: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { mode = 'rule' } = controledMihomoConfig || {}
  const {
    useWindowFrame = false,
    appTheme = 'system',
    mainSwitchMode = 'tun',
    autoCloseConnection = true
  } = appConfig || {}
  const { setTheme, resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark' || appTheme === 'dark'
  const [isFocused, setIsFocused] = useState(document.hasFocus())
  const isMac = platform === 'darwin'

  const { profileConfig, addProfileItem, removeProfileItem, changeCurrentProfile, updateProfileItem } =
    useProfileConfig()
  const remoteItem = profileConfig?.items?.find((i) => i.type === 'remote')
  const subAutoUpdate = remoteItem?.autoUpdate ?? false
  const current = profileConfig?.current
  const activeIndex = SLOT_IDS.indexOf(current || '')
  const activeSlot = activeIndex >= 0 ? String(activeIndex + 1) : '1'
  const editDisabled = !current || current === SUBSCRIPTION_SLOT

  const { data: autoRunEnabled, mutate: mutateAutoRun } = useSWR('checkAutoRun', checkAutoRun)

  const [updatingProfile, setUpdatingProfile] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  useEffect(() => {
    if (useWindowFrame) return

    const onFocus = (): void => setIsFocused(true)
    const onBlur = (): void => setIsFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [useWindowFrame])

  const updateCurrentProfile = async (): Promise<void> => {
    if (!remoteItem) return
    setUpdatingProfile(true)
    try {
      await addProfileItem(remoteItem)
      toast.success(t('profile.updateSubscription'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setUpdatingProfile(false)
    }
  }

  const toggleAutoRun = async (enabled: boolean): Promise<void> => {
    try {
      if (enabled) {
        await enableAutoRun()
      } else {
        await disableAutoRun()
      }
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      mutateAutoRun()
    }
  }

  const handleDeleteProfile = (): void => {
    if (remoteItem) {
      setTimeout(() => removeProfileItem(remoteItem.id), 200)
      setConfirmDeleteOpen(false)
    }
  }

  const onModeChange = async (m: 'rule' | 'global'): Promise<void> => {
    try {
      await patchControledMihomoConfig({ mode: m })
      await patchMihomoConfig({ mode: m })
      if (autoCloseConnection) {
        await mihomoCloseAllConnections()
      }
      window.electron.ipcRenderer.send('updateTrayMenu')
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const onSubAutoUpdate = async (value: boolean): Promise<void> => {
    if (!remoteItem) return
    try {
      await updateProfileItem({
        ...remoteItem,
        autoUpdate: value,
        interval:
          value && (!remoteItem.interval || remoteItem.interval === 0)
            ? 1440
            : remoteItem.interval
      })
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const onEditConfig = async (): Promise<void> => {
    if (editDisabled || !current) return
    try {
      await openFile(current)
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  if (useWindowFrame) return null

  const handleMinimize = (): void => {
    window.electron.ipcRenderer.invoke('windowMinimize')
  }
  const handleClose = (): void => {
    window.electron.ipcRenderer.invoke('windowClose')
  }

  const settingsButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button key="settings" className="wc-btn wc-settings" title={t('common.profileSettings')}>
          <Settings className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="w-72">
        {/* Управление подпиской */}
        <DropdownMenuItem
          disabled={!remoteItem || updatingProfile}
          onClick={updateCurrentProfile}
        >
          <RefreshCcw className={updatingProfile ? 'animate-spin' : undefined} />
          {t('profile.updateSubscription')}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={!remoteItem} onClick={() => setConfirmDeleteOpen(true)}>
          <Trash2 />
          {t('profile.delete')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Тёмная тема */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <Moon className="size-3.5 text-muted-foreground" />
            <span className="text-sm">{t('settings.appearance.dark')}</span>
          </div>
          <Switch
            checked={isDark}
            onCheckedChange={(value) => {
              const newTheme = value ? 'dark' : 'light'
              setTheme(newTheme)
              setNativeTheme(newTheme)
              patchAppConfig({ appTheme: newTheme })
            }}
            className="scale-90"
          />
        </div>
        <DropdownMenuSeparator />
        {/* Автозапуск */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm">{t('settings.general.autoStart')}</span>
          <Switch
            checked={autoRunEnabled ?? false}
            onCheckedChange={(value) => toggleAutoRun(Boolean(value))}
            className="scale-90"
          />
        </div>
        <DropdownMenuSeparator />
        {/* Новые переключатели (внизу) */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm">{t('settings.advanced.mainSwitch')}</span>
          <Segmented
            value={mainSwitchMode}
            options={[
              { value: 'tun', label: t('settings.advanced.mainSwitchTun') },
              { value: 'sysproxy', label: t('settings.advanced.mainSwitchProxyMode') }
            ]}
            onChange={(v) => patchAppConfig({ mainSwitchMode: v as 'tun' | 'sysproxy' })}
          />
        </div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm">{t('settings.advanced.outboundModeTitle')}</span>
          <Segmented
            value={mode}
            options={[
              { value: 'rule', label: t('settings.advanced.outboundModeRule') },
              { value: 'global', label: t('settings.advanced.outboundModeGlobal') }
            ]}
            onChange={(v) => onModeChange(v as 'rule' | 'global')}
          />
        </div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm">{t('settings.advanced.subAutoUpdate')}</span>
          <Switch
            checked={subAutoUpdate}
            disabled={!remoteItem}
            onCheckedChange={(value) => onSubAutoUpdate(Boolean(value))}
            className="scale-90"
          />
        </div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm">{t('settings.advanced.profilesTitle')}</span>
          <Segmented
            value={activeSlot}
            options={[
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' }
            ]}
            onChange={(v) => {
              const id = SLOT_IDS[parseInt(v, 10) - 1]
              if (id && id !== current) {
                changeCurrentProfile(id).catch((e) => toast.error(`${e}`))
              }
            }}
          />
        </div>
        <DropdownMenuItem
          disabled={editDisabled}
          onSelect={(e) => {
            e.preventDefault()
            onEditConfig()
          }}
          className={editDisabled ? 'opacity-40' : ''}
        >
          <Pencil className="size-4" />
          {t('settings.advanced.editConfig')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const closeBtn = (
    <button key="close" className="wc-btn wc-close" onClick={handleClose}>
      <svg viewBox="0 0 10 10" fill="none">
        <path
          d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )

  const minimizeBtn = (
    <button key="minimize" className="wc-btn wc-minimize" onClick={handleMinimize}>
      <svg viewBox="0 0 10 10" fill="none">
        <path d="M1.5 5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </button>
  )

  const buttons = isMac ? [settingsButton, closeBtn, minimizeBtn] : [settingsButton, minimizeBtn, closeBtn]

  return (
    <>
      <div
        className={`wc-group app-nodrag ${isMac ? `wc-mac${!isFocused ? ' wc-blurred' : ''}` : 'wc-win'}`}
      >
        {buttons}
      </div>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="size-8 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('profile.confirmDeleteProfile')}</AlertDialogTitle>
            <AlertDialogDescription className="truncate max-w-3xs">
              {remoteItem?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteProfile}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default WindowControls