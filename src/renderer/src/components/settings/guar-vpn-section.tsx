import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button } from '@renderer/components/ui/button'
import { useTranslation } from 'react-i18next'
import { Globe, Send } from 'lucide-react'

const SITE_URL = 'https://get.guar.one/?campaign=GUAR_Clash'
const BOT_URL = 'https://t.me/GUAR_ProtectionBot?start=GUAR_Clash'

const GuarVpnSection: React.FC = () => {
  const { t } = useTranslation()
  return (
    <SettingCard>
      <SettingItem title={t('guarVpn.title')} divider>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.open(SITE_URL)}>
            <Globe className="size-4" />
            {t('guarVpn.site')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(BOT_URL)}>
            <Send className="size-4" />
            {t('guarVpn.bot')}
          </Button>
        </div>
      </SettingItem>
    </SettingCard>
  )
}

export default GuarVpnSection
