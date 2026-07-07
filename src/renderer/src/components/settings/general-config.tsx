import React, { useState } from 'react'
import { toast } from 'sonner'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import useSWR from 'swr'
import { checkAutoRun, disableAutoRun, enableAutoRun, relaunchApp, setNativeTheme } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import ConfirmModal from '../base/base-confirm'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { MessageCircleQuestionMark, Moon, Sun } from 'lucide-react'

interface GeneralConfigProps {
  showHiddenSettings: boolean
}

const GeneralConfig: React.FC<GeneralConfigProps> = (props) => {
  const { showHiddenSettings } = props
  const { t } = useTranslation()
  const { data: enable, mutate: mutateEnable } = useSWR('checkAutoRun', checkAutoRun)
  const { appConfig, patchAppConfig } = useAppConfig()
  const { setTheme, resolvedTheme } = useTheme()
  const {
    silentStart = false,
    disableGPU = false,
    appTheme = 'system'
  } = appConfig || {}
  const isDark = resolvedTheme === 'dark' || appTheme === 'dark'

  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [pendingDisableGPU, setPendingDisableGPU] = useState(disableGPU)

  return (
    <>
      {showRestartConfirm && (
        <ConfirmModal
          title={t('modal.confirmRestart')}
          description={
            <div>
              <p>{t('modal.restartForGPUChange')}</p>
            </div>
          }
          confirmText={t('common.restart')}
          cancelText={t('common.cancel')}
          onChange={(open) => {
            if (!open) {
              setPendingDisableGPU(disableGPU)
            }
            setShowRestartConfirm(open)
          }}
          onConfirm={async () => {
            await patchAppConfig({ disableGPU: pendingDisableGPU })
            await relaunchApp()
          }}
        />
      )}
      <SettingCard>
        <SettingItem title={t('settings.general.autoStart')} divider>
          <Switch
            checked={enable ?? false}
            onCheckedChange={async (value) => {
              try {
                if (value) {
                  await enableAutoRun()
                } else {
                  await disableAutoRun()
                }
              } catch (e) {
                toast.error(`${e}`)
              } finally {
                mutateEnable()
              }
            }}
          />
        </SettingItem>
        <SettingItem title={t('settings.appearance.backgroundColor')} divider>
          <div className="flex items-center gap-2">
            <Moon className="size-4 text-muted-foreground" />
            <Switch
              checked={isDark}
              onCheckedChange={(value) => {
                const newTheme = value ? 'dark' : 'light'
                setTheme(newTheme)
                setNativeTheme(newTheme)
                patchAppConfig({ appTheme: newTheme })
              }}
            />
            <Sun className="size-4 text-muted-foreground" />
          </div>
        </SettingItem>
        <SettingItem title={t('settings.general.silentStart')} divider={showHiddenSettings}>
          <Switch
            checked={silentStart}
            onCheckedChange={(value) => {
              patchAppConfig({ silentStart: value })
            }}
          />
        </SettingItem>
        {showHiddenSettings && (
          <SettingItem
            title={t('settings.general.disableGPU')}
            actions={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <MessageCircleQuestionMark className="text-lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('settings.general.disableGPUHelp')}</TooltipContent>
              </Tooltip>
            }
          >
            <Switch
              checked={pendingDisableGPU}
              onCheckedChange={(value) => {
                setPendingDisableGPU(value)
                setShowRestartConfirm(true)
              }}
            />
          </SettingItem>
        )}
      </SettingCard>
    </>
  )
}

export default GeneralConfig
