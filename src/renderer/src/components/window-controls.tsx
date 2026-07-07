import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { platform } from '@renderer/utils/init'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { checkAutoRun, disableAutoRun, enableAutoRun } from '@renderer/utils/ipc'
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
import { Settings, RefreshCcw, Trash2, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { setNativeTheme } from '@renderer/utils/ipc'

const WindowControls: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { useWindowFrame = false, appTheme = 'system' } = appConfig || {}
  const { setTheme, resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark' || appTheme === 'dark'
  const [isFocused, setIsFocused] = useState(document.hasFocus())
  const isMac = platform === 'darwin'

  const { profileConfig, addProfileItem, removeProfileItem } = useProfileConfig()
  const currentProfile = profileConfig?.items?.find((item) => item.id === profileConfig.current)
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
    if (!currentProfile || currentProfile.type !== 'remote') return
    setUpdatingProfile(true)
    try {
      await addProfileItem(currentProfile)
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
    if (currentProfile) {
      setTimeout(() => removeProfileItem(currentProfile.id), 200)
      setConfirmDeleteOpen(false)
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
      <DropdownMenuContent align="end" side="bottom" className="w-48">
        <DropdownMenuItem
          disabled={!currentProfile || currentProfile.type !== 'remote' || updatingProfile}
          onClick={updateCurrentProfile}
        >
          <RefreshCcw className={updatingProfile ? 'animate-spin' : undefined} />
          {t('profile.updateSubscription')}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!currentProfile}
          onClick={() => setConfirmDeleteOpen(true)}
        >
          <Trash2 />
          {t('profile.delete')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm">{t('settings.general.autoStart')}</span>
          <Switch
            checked={autoRunEnabled ?? false}
            onCheckedChange={(value) => toggleAutoRun(Boolean(value))}
            className="scale-90"
          />
        </div>
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

  // Order: settings, minimize, close (left to right)
  const buttons = isMac ? [settingsButton, closeBtn, minimizeBtn] : [settingsButton, minimizeBtn, closeBtn]

  return (
    <>
      <div className={`wc-group app-nodrag ${isMac ? `wc-mac${!isFocused ? ' wc-blurred' : ''}` : 'wc-win'}`}>
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
              {currentProfile?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteProfile}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default WindowControls
