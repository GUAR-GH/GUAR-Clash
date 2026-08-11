# План: Настройки — переключатели режимов, профили правил, обновление ядра, релиз

> Файл-бриф для реализации. GUAR Clash — форк koala-clash (Electron + React + Vite + Mihomo).
> Цель: компактный UI, единая подписка, 3 слота профилей правил, переключатели режимов в Настройках, обновление ядра mihomo, релиз новой версии.

---

## 0. Контекст (текущее состояние кода)

- `src/renderer/src/pages/settings.tsx` — страница Настройки: `ProxySwitches` → `GeneralConfig` → `Language` → `Appearance` → `Advanced` → `Shortcut` → `Actions`.
- `src/renderer/src/components/settings/proxy-switches.tsx` — уже есть:
  - `mainSwitchMode: 'tun' | 'sysproxy'` (Tabs) — **первый переключатель готов**;
  - Switch `tun.enable`;
  - Switch `proxyMode` (системный прокси вкл/выкл).
- `src/renderer/src/components/sider/outbound-mode-switcher.tsx` — **мёртвый код** (не импортируется нигде). Используем как референс для логики rule/global:
  - `patchControledMihomoConfig({ mode })` + `patchMihomoConfig({ mode })` (из `@renderer/utils/ipc`);
  - при `autoCloseConnection` → `mihomoCloseAllConnections()`;
  - `window.electron.ipcRenderer.send('updateTrayMenu')`.
- `src/renderer/src/pages/home.tsx` — читает `outboundMode`. **Внимание:** там есть `useEffect`, который при `outboundMode === 'global'` принудительно делает `patchControledMihomoConfig({ mode: 'rule' })` (автосброс при загрузке ядра). Проверить и ослабить, чтобы выбор пользователя «Глобальный» сохранялся.
- Профили: `ProfileConfig { current, items: ProfileItem[] }` (`src/shared/types/app.d.ts`). `ProfileItem` уже имеет `type: 'remote' | 'local'`, `url`, `file`, `interval`, `autoUpdate?`, `locked?`.
- Файлы: `profilePath(id)` = `dataDir/profiles/<id>.yaml` (конфиг профиля); `rulePath(id)` = `dataDir/rules/<id>.yaml` (переопределение правил, используется в `generateProfile`).
- IPC: `openFile(id)` → `shell.openPath(profilePath(id))` — открытие конфига во **внешнем редакторе** (уже готово, `src/main/sys/misc.ts`).
- Подписка: `addProfileItem(remote)` (`src/main/config/profile.ts`) — скачивает и перезаписывает файл профиля. Авто-обновление: `src/main/core/profileUpdater.ts` (тик 60с, по `interval` и `autoUpdate`).
- Ядро: mihomo, бинарник `extra/sidecar/mihomo.exe` (gitignored). `scripts/prepare.mjs` качает **latest** mihomo (+ alpha) при `pnpm install`/`pnpm prepare --x64`. Версия в коде не зашита.
- Релиз: см. `docs/release-guide.md`. Версия в `package.json` (semver без `v`), секция в `changelog.md`, сборка, push, GitHub Actions `Build` с тегом версии.

---

## 1. Настройки: переключатель «Правила / Глобальный» (новый)

**Файл:** `src/renderer/src/components/settings/proxy-switches.tsx` (добавить `SettingItem` с `Tabs`) или новый компонент рядом.

- `Tabs` со значениями `'rule' | 'global'`, привязан к `controledMihomoConfig.mode`.
- `onValueChange`:
  ```ts
  await patchControledMihomoConfig({ mode })
  await patchMihomoConfig({ mode })
  if (autoCloseConnection) await mihomoCloseAllConnections()
  window.electron.ipcRenderer.send('updateTrayMenu')
  ```
  (референс — `outbound-mode-switcher.tsx`).
- Семантика: `rule` — по правилам подписки; `global` — всё через прокси, минуя правила (как в оригинале koala-clash).
- **Проверить `home.tsx`** (useEffect с автосбросом global→rule) — не должен сбрасывать пользовательский «Глобальный» при нормальной работе; скорректировать условие.

## 2. Настройки: переключатель «Авто-обновление подписки» (новый)

**Файл:** новый `SettingItem` (в `proxy-switches.tsx` или отдельной карточке).

- `Switch`, отражает `autoUpdate` единственного remote-профиля.
- `useProfileConfig` → найти remote-айтем → `updateProfileItem({ ...remote, autoUpdate: value })`.
- При включении, если `interval` не задан — ставить разумное значение по умолчанию (напр. `1440` мин = 24ч). Зафиксировать константу.
- Фоновой `profileUpdater.ts` уже работает — трогать не нужно (он обновляет все remote, а remote теперь один).

## 3. Настройки: секция «Профили» (новая)

**Файл:** новый `src/renderer/src/components/settings/profile-switches.tsx`, подключить в `settings.tsx` после `ProxySwitches`.

UI (компактно, мало места):
```
профиль:
[ 1 | 2 | 3 ]          ← сегментный Tabs (values = id слотов)
[ Изменить конфиг ]    ← Button: приглушённый/отключённый для слота 1, активный для 2/3
```

- Селектор 1/2/3 → `changeCurrentProfile(slotId)` (из `useProfileConfig`).
- Кнопка «Изменить конфиг»:
  - **слот 1** (remote, `locked`) — `disabled`, визуально приглушённая;
  - **слоты 2/3** — `onClick` → `openFile(slotId)` (открывает `profilePath(id)` в системном редакторе по умолчанию).
- Подпись/порядок слотов фиксированный: слот 1 = подписка (remote, `locked: true`), слот 2 = локальная копия, слот 3 = локальная копия.

## 4. Бэкенд: модель 3 фиксированных слотов (главное)

**Файлы:** `src/main/config/profile.ts` (+ `src/main/utils/init.ts` для миграции).

### 4.1. Стабильные id слотов
Ввести фиксированные id: `profile-1` (remote, locked), `profile-2` (local), `profile-3` (local). Использовать их в селекторе и при инициализации. Не путать со спец-id `'default'`.

### 4.2. Enforce single remote (только одна подписка)
В `addProfileItem`:
- если добавляется `remote` и уже есть remote с другим `url` — **заменять** существующий remote (обновить `url`, `ua`, `interval`, `name` по новому), а не создавать второй;
- дубликат по тому же `url` уже отклоняется (есть проверка `duplicate`).

### 4.3. Инициализация слотов 2/3
- При первом старте/миграции: если `profile-2`/`profile-3` отсутствуют — создать local-айтемы.
- Если файл слота 2/3 пустой или не существует → **скопировать содержимое файла слота 1** (`profilePath('profile-1')`) в `profilePath('profile-2')`/`('profile-3')`.
- Если файл уже есть и не пустой → **не трогать** (сохранить правки пользователя).

### 4.4. Поведение при обновлении подписки
В `addProfileItem` (после перезаписи файла слота 1):
- инициализировать пустые слоты 2/3 из слота 1 (см. 4.3);
- **принудительно `changeCurrentProfile('profile-1')`** — переключиться на слот 1, чтобы перезапись конфига новыми правилами не затёрла правки пользователя в 2/3.
- Это покрывает и ручное обновление, и фоновое (`profileUpdater.ts` вызывает `addProfileItem`).

### 4.5. Блокировка редактирования слота 1
- `locked: true` на remote-айтеме. В UI кнопка «Изменить конфиг» для слота 1 отключена. Программная запись `setProfileStr('profile-1', ...)` извне тоже не нужна — слот 1 пишется только при обновлении подписки.

## 5. Удалить встроенный Monaco-редактор и страницу Profiles

- Удалить: `src/renderer/src/components/profiles/edit-rules-modal.tsx`, `edit-file-modal.tsx` (Monaco-редактирование правил/файла больше не нужно — только внешний редактор).
- Удалить: `src/renderer/src/pages/profiles.tsx`.
- `src/renderer/src/routes/index.tsx`: убрать роут `/profiles` и импорт `Profiles`.
- `src/renderer/src/components/app-sidebar.tsx`: убрать пункт навигации `profile` (`/profiles`) и из `allowedWithoutProfiles` (оставить `['main', 'settings']`; остальные — только когда `hasProfiles`).
- Оставить: `src/renderer/src/components/profiles/hwid-limit-alert.tsx` (используется в `App.tsx`).
- `guar://`-импорт подписки оставить рабочим: main-процесс (`src/main/index.ts`) уже дёргает `addProfileItem` — с enforce single remote это просто заменит подписку. На Home оставить импорт из буфера.
- (Опционально, если нужно редактировать URL подписки — вынести минимальный edit-info в Настройки. По умолчанию не делаем — импорт через `guar://`.)

## 6. Миграция существующих данных (на старте)

**Файл:** `src/main/utils/init.ts` (или новая функция в `config/profile.ts`, вызывать при init).

- Загрузить `profile.yaml`.
- Если уже есть 3 фиксированных слота — ничего не делать.
- Иначе:
  - взять существующий remote-профиль (текущий/первый) → переименовать id в `profile-1`, переместить файл `profiles/<old>.yaml` → `profiles/profile-1.yaml`, поставить `locked: true`. (Если несколько remote — оставить один, остальные не переносить; для GUAR-сценария это норма. Подтвердить у владельца.)
  - создать `profile-2`, `profile-3` (local) при отсутствии; инициализировать файлы из `profile-1` если пусто.
  - `current` = `profile-1` если не задано.
- Не удалять `userData`/миграции — требования `release-guide.md`.

## 7. Локализация

**Файлы:** `src/renderer/src/locales/{ru-RU,en-US,zh-CN}/index.ts` (или соответствующие namespace).

Добавить ключи:
- `settings.modeTitle` — «Режим прокси» / «Proxy mode» / «代理模式»
- `settings.modeRule` / `settings.modeGlobal` — «Правила» / «Глобальный»
- `settings.subAutoUpdate` — «Авто-обновление подписки» / «Auto-update subscription» / «自动更新订阅»
- `settings.profileTitle` — «профиль:» (оставить как в ТЗ)
- `settings.editConfig` — «Изменить конфиг» / «Edit config» / «编辑配置»
- при необходимости — подписи слотов.

## 8. Обновление ядра mihomo

- Запустить `pnpm prepare --x64` (скачает latest mihomo + alpha в `extra/sidecar`). Версия в коде не зашита — берётся свежий релиз.
- Локально проверить: `pnpm dev`, убедиться что ядро стартует.
- При релизе `prepare` запускается в GitHub Actions (`build.yml`, step `Install Dependencies and Prepare`) — ядро обновится автоматически.

## 9. Финал: версия и релиз в Git

Согласно `docs/release-guide.md`:

1. `package.json` → `version`: bump `1.3.0` → **`1.4.0`** (feature-релиз).
2. `changelog.md` → добавить секцию `## 1.4.0` с кратким списком изменений.
3. `pnpm typecheck` — типы должны пройти.
4. Сборка (Windows): `$env:CSC_IDENTITY_AUTO_DISCOVERY='false'; pnpm build:win -- --x64` → артефакты в `dist/`.
5. Проверить установщик (чистая установка + поверх предыдущей версии; `userData` сохраняет подписки/настройки).
6. Коммит и push:
   ```powershell
   git add package.json changelog.md src scripts .github docs README.md build
   git commit -m "release 1.4.0"
   git push origin main
   ```
7. Релиз: GitHub → Actions → `Build` → `Run workflow` → поле `Tag version to release` = `1.4.0`. Дождаться сборки. Либо вручную (`pnpm updater` + `Releases → Draft a new release`, тег `1.4.0`).
8. Проверка обновлений в приложении смотрит в `releases/latest` репо `GUAR-GH/GUAR-Clash` — новый релиз подхватится автоматически.

---

## Список затрагиваемых файлов

Новые:
- `src/renderer/src/components/settings/profile-switches.tsx`

Правки:
- `src/renderer/src/components/settings/proxy-switches.tsx` (rule/global + auto-update)
- `src/renderer/src/pages/settings.tsx` (подключить `ProfileSwitches`)
- `src/renderer/src/pages/home.tsx` (проверить/ослабить автосброс global→rule)
- `src/main/config/profile.ts` (enforce single remote, init слотов 2/3, автосброс на слот 1 при обновлении)
- `src/main/utils/init.ts` (миграция на 3 слота)
- `src/renderer/src/routes/index.tsx` (убрать `/profiles`)
- `src/renderer/src/components/app-sidebar.tsx` (убрать пункт profile)
- `src/renderer/src/locales/{ru-RU,en-US,zh-CN}` (новые ключи)
- `package.json` (version → 1.4.0)
- `changelog.md` (секция 1.4.0)

Удалить:
- `src/renderer/src/pages/profiles.tsx`
- `src/renderer/src/components/profiles/edit-rules-modal.tsx`
- `src/renderer/src/components/profiles/edit-file-modal.tsx`
- `src/renderer/src/components/profiles/profile-item.tsx` (использовался только на странице Profiles)

## Открытые вопросы (подтвердить перед реализацией)

1. При миграции, если у старого пользователя несколько remote-подписок — оставляем одну (остальные отбрасываем) или конвертируем лишние в local-копии? (По умолчанию — оставляем одну.)
2. Нужно ли сохранять возможность редактировать URL подписки (edit-info), или только импорт через `guar://`? (По умолчанию — только `guar://`.)
3. Интервал авто-обновления по умолчанию = 24ч (`1440` мин)? ОК?
4. Версию релиза ставить `1.4.0`? ОК?
