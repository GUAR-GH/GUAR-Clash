import React from 'react'
import { toast } from 'sonner'
import SettingCard from '../base/base-setting-card'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { openFile } from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'

// Фиксированные слоты профилей правил (должны совпадать с main/config/profile.ts)
const SUBSCRIPTION_SLOT = 'profile-1'
const SLOT_IDS = ['profile-1', 'profile-2', 'profile-3']

const ProfileSwitches: React.FC = () => {
  const { t } = useTranslation()
  const { profileConfig, changeCurrentProfile } = useProfileConfig()
  const current = profileConfig?.current
  const activeIndex = SLOT_IDS.indexOf(current || '')
  const activeSlot = activeIndex >= 0 ? String(activeIndex + 1) : '1'

  const editDisabled = !current || current === SUBSCRIPTION_SLOT

  const onEdit = async (): Promise<void> => {
    if (editDisabled || !current) return
    try {
      await openFile(current)
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  return (
    <SettingCard>
      <div className="flex flex-col gap-2 py-1">
        <h4 className="text-md leading-none text-muted-foreground">
          {t('settings.advanced.profilesTitle')}
        </h4>
        <Tabs
          value={activeSlot}
          onValueChange={async (value) => {
            const idx = parseInt(value, 10) - 1
            const id = SLOT_IDS[idx]
            if (id) {
              try {
                await changeCurrentProfile(id)
              } catch (e) {
                toast.error(`${e}`)
              }
            }
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="1" className="flex-1">
              1
            </TabsTrigger>
            <TabsTrigger value="2" className="flex-1">
              2
            </TabsTrigger>
            <TabsTrigger value="3" className="flex-1">
              3
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="h-[32px] w-full flex items-center justify-end">
        <Button
          size="sm"
          variant={editDisabled ? 'ghost' : 'outline'}
          disabled={editDisabled}
          className={editDisabled ? 'opacity-40' : ''}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
          {t('settings.advanced.editConfig')}
        </Button>
      </div>
    </SettingCard>
  )
}

export default ProfileSwitches