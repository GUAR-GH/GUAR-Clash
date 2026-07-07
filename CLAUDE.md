# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GUAR Clash — визуальный форк Koala Clash для Mihomo. Electron-приложение с React/TypeScript фронтендом.

## Commands

```bash
# Установка зависимостей
pnpm install

# Разработка
pnpm dev

# Типизация
pnpm typecheck

# Линтинг
pnpm lint

# Форматирование
pnpm format

# Сборка (Windows)
pnpm build:win

# Сборка (macOS)
pnpm build:mac

# Сборка (Linux)
pnpm build:linux

# Скрипты для релиза
pnpm prepare --x64      # Скачать sidecar-файлы
pnpm updater            # Генерация latest.yml
pnpm checksum           # Генерация хэшей
pnpm telegram           # Отправка в Telegram
pnpm artifact           # Создание артефактов
```

## Architecture

### Структура приложения

```
src/
├── main/           # Electron main process
│   ├── config/     # Конфигурации (app, mihomo, profile)
│   ├── core/       # Ядро: mihomoApi, manager, profileUpdater, appUpdater
│   ├── resolve/    # UI компоненты: tray, menu, shortcut, theme, floatingWindow
│   ├── service/    # Windows service для sysproxy
│   ├── sys/        # Системные: sysproxy, autoRun, interface, ssid
│   └── utils/      # Утилиты: ipc, dirs, yaml, encrypt, i18n
├── renderer/       # React frontend
│   ├── src/
│   │   ├── components/  # UI компоненты
│   │   ├── pages/       # Страницы: home, proxies, rules, connections, settings
│   │   ├── hooks/       # React hooks: useAppConfig, useProfileConfig
│   │   ├── store/       # Zustand stores
│   │   ├── locales/     # i18n: ru-RU, en-US, zh-CN
│   │   └── utils/       # IPC wrapper, init, validation
│   └── preload/    # Electron preload script
└── shared/types/   # TypeScript types
```

### Основные модули

**Main Process:**
- `src/main/index.ts` — точка входа, создание окна, обработка deep links (`guar://`)
- `src/main/core/manager.ts` — управление ядром Mihomo (старт/стоп/рестарт)
- `src/main/core/mihomoApi.ts` — API взаимодействие с Mihomo
- `src/main/config/` — управление конфигами (AppConfig, MihomoConfig, ProfileConfig)
- `src/main/utils/ipc.ts` — IPC handlers для связи с renderer

**Renderer:**
- `src/renderer/src/App.tsx` — корневой компонент, роутинг, theme
- `src/renderer/src/pages/` — основные страницы приложения
- `src/renderer/src/hooks/` — SWR hooks для конфигов
- `src/renderer/src/utils/ipc.ts` — IPC wrappers для вызова main process

**Конфигурации:**
- `electron.vite.config.ts` — Vite конфиг (main, preload, renderer)
- `electron-builder.yml` — настройки сборки electron-builder
- `tsconfig.node.json` / `tsconfig.web.json` — TypeScript конфиги

### IPC Architecture

Вся коммуникация между main и renderer происходит через IPC:
- Renderer вызывает функции через `window.electron.ipcRenderer.invoke()`
- Main регистрирует handlers в `registerIpcMainHandlers()`
- Ошибки оборачиваются в `{ invokeError: ... }`

### State Management

- **SWR** — для конфигов (AppConfig, MihomoConfig, ProfileConfig)
- **Zustand** — для динамических данных (connections, logs, traffic)

### Deep Links

Приложение поддерживает `guar://` схему для импорта подписок:
```
guar://install-config?url=<encoded_url>&name=<profile_name>
```

## Release Process

См. [docs/release-guide.md](./docs/release-guide.md) для полного гайда.

Ключевые файлы для обновления релиза:
- `package.json` — version (semver без `v`)
- `changelog.md` — новая секция с версией

## Platform-specific Notes

**Windows:**
- Установщик: `GUAR Clash_x64-setup.exe`
- Portable: `GUAR Clash_x64-portable.7z`
- Требуется elevated task для sysproxy (не в режиме service)
- SmartScreen может показывать предупреждение (неподписанный код)

**macOS:**
- Формат: `.pkg`
- Требуется entitlements для доступа к файлам

**Linux:**
- Форматы: deb, rpm, pacman
- Post-install скрипт в `build/linux/postinst`

## Dependencies

**Ключевые:**
- Electron 37, React 19, TypeScript 5
- Tailwind CSS 4, Radix UI, Lucide React
- Zustand (state), SWR (data fetching)
- Monaco Editor (YAML editing)
- i18next (локализация)

**Сборка:**
- electron-vite, electron-builder
- pnpm 10.33+ (указан в packageManager)
