import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  ProfileIcon,
  ProxiesIcon,
  ConnectionsIcon,
  RulesIcon,
  LogsIcon,
  SettingsIcon,
  CollapsedIcon,
  ExpandedIcon
} from '@renderer/components/icons/sidebar-icons'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@renderer/components/ui/sidebar'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import ConfigViewer from '@renderer/components/sider/config-viewer'
import guarLogo from '@renderer/assets/guar-logo.png'

const navItems = [
  { key: 'main', path: '/home', icon: HomeIcon, i18nKey: 'sider.home' },
  { key: 'profile', path: '/profiles', icon: ProfileIcon, i18nKey: 'sider.profileManagement' },
  { key: 'proxy', path: '/proxies', icon: ProxiesIcon, i18nKey: 'sider.proxyGroup' },
  { key: 'connection', path: '/connections', icon: ConnectionsIcon, i18nKey: 'sider.connection' },
  { key: 'rule', path: '/rules', icon: RulesIcon, i18nKey: 'sider.rules' },
  { key: 'log', path: '/logs', icon: LogsIcon, i18nKey: 'sider.logs' },
  { key: 'settings', path: '/settings', icon: SettingsIcon, i18nKey: 'common.settings' }
]

const allowedWithoutProfiles = new Set(['main', 'profile', 'settings'])

const AppSidebar: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleSidebar, state } = useSidebar()
  const collapsed = state === 'collapsed'
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false)
  const { profileConfig } = useProfileConfig()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const filteredNavItems = hasProfiles
    ? navItems
    : navItems.filter((item) => allowedWithoutProfiles.has(item.key))

  return (
    <Sidebar
      data-guide="app-sidebar"
      collapsible="icon"
      side="left"
      variant="floating"
      className="pt-10"
    >
      <SidebarHeader>
        <div className="glass-surface flex h-12 items-center gap-2 rounded-md px-2 group-data-[collapsible=icon]:aspect-square group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <img
            src={guarLogo}
            alt="GUAR"
            className="aspect-square size-8 shrink-0 rounded-md object-contain shadow-[0_0_18px_rgba(217,70,239,0.35)]"
          />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold tracking-normal text-sidebar-foreground">
              GUAR
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname.includes(item.path)
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      className="cursor-pointer"
                      tooltip={t(item.i18nKey)}
                      isActive={isActive}
                      data-guide={item.key === 'main' ? 'sidebar-home-button' : undefined}
                      onClick={() => navigate(item.path)}
                      onDoubleClick={
                        item.key === 'profile' ? () => setShowRuntimeConfig(true) : undefined
                      }
                    >
                      <Icon className="size-4" />
                      <span>{t(item.i18nKey)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t('common.toggleSidebar')}
              onClick={toggleSidebar}
              className="cursor-pointer w-full"
            >
              {collapsed ? (
                <ExpandedIcon className="size-4 shrink-0" />
              ) : (
                <CollapsedIcon className="size-4 shrink-0" />
              )}
              <span>{t('common.hideSidebar')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      {showRuntimeConfig && <ConfigViewer onClose={() => setShowRuntimeConfig(false)} />}
    </Sidebar>
  )
}

export default AppSidebar
