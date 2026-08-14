import React, { useEffect, useState } from 'react'
import { BaseEditor } from '@renderer/components/base/base-editor-lazy'
import { Button } from '@renderer/components/ui/button'
import { applyTheme, getProfileStr, setProfileStr, validateProfile } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const ConfigEditorApp: React.FC = () => {
  const { t } = useTranslation()
  const id = new URLSearchParams(window.location.search).get('id') || ''
  const { appConfig } = useAppConfig()
  const { customTheme = 'default.css' } = appConfig || {}
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    applyTheme(customTheme)
  }, [customTheme])

  useEffect(() => {
    getProfileStr(id)
      .then((v) => {
        setValue(v)
        setLoading(false)
      })
      .catch((e) => {
        toast.error(`${e}`)
        setLoading(false)
      })
  }, [id])

  const onSave = async (): Promise<void> => {
    try {
      await setProfileStr(id, value)
      const v = await validateProfile(id)
      if (!v.ok) {
        toast.warning(
          `${t('settings.advanced.brokenConfigBlockStart')}${v.error ? ': ' + v.error : ''}`
        )
      }
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <div className="app-drag flex h-10 shrink-0 items-center justify-between border-b border-stroke px-3">
        <span className="text-sm font-medium">{t('settings.advanced.editConfig')}</span>
        <div className="app-nodrag flex items-center gap-2">
          <Button size="sm" onClick={onSave}>
            {t('common.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.close()}>
            {t('common.close')}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {!loading && <BaseEditor language="yaml" value={value} onChange={(v) => setValue(v)} />}
      </div>
    </div>
  )
}

export default ConfigEditorApp
