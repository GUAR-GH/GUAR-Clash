import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import '@renderer/assets/main.css'
import '@renderer/i18n'
import ConfigEditorApp from '@renderer/components/config-editor-app'
import BaseErrorBoundary from '@renderer/components/base/base-error-boundary'
import { AppConfigProvider } from '@renderer/hooks/use-app-config'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <NextThemesProvider attribute="class" enableSystem defaultTheme="dark">
      <BaseErrorBoundary>
        <AppConfigProvider>
          <ConfigEditorApp />
        </AppConfigProvider>
      </BaseErrorBoundary>
    </NextThemesProvider>
  </React.StrictMode>
)
