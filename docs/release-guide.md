# Гайд по сборке и выпуску GUAR Clash

Этот порядок рассчитан на Windows и репозиторий `GUAR-GH/koala-clash-guar-styled`.

## 1. Подготовить код

```powershell
git status
git pull origin main
```

Перед релизом обновите:

- `package.json` -> `version`
- `changelog.md` -> добавьте секцию с такой же версией, например `## 1.2.1`

Версия должна быть обычной semver-версией без буквы `v`: `1.2.1`, `1.3.0`, `2.0.0`.

## 2. Установить зависимости с нуля

```powershell
$env:SKIP_PREPARE='1'
npx --yes pnpm@10.33.0 install
Remove-Item Env:\SKIP_PREPARE
npx --yes pnpm@10.33.0 prepare --x64
```

`prepare --x64` скачивает sidecar-файлы для Windows x64. Для arm64 используйте `prepare --arm64`.

## 3. Проверить проект

```powershell
npx --yes pnpm@10.33.0 run typecheck
```

Если типы прошли, можно собирать.

## 4. Собрать Windows-версию локально

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx --yes pnpm@10.33.0 run build:win -- --x64
```

Готовые файлы будут в `dist/`:

- `GUAR Clash_x64-setup.exe` - установщик
- `GUAR Clash_x64-portable.7z` - portable-архив

Проверьте установщик на чистой установке поверх предыдущей версии. Пользовательские данные лежат в `app.getPath('userData')`, поэтому обновление через установщик не должно удалять подписки и настройки.

## 5. Залить изменения в GitHub

```powershell
git status
git add package.json changelog.md src scripts .github docs README.md build
git commit -m "release 1.2.1"
git push origin main
```

Замените `1.2.1` на текущую версию.

## 6. Вариант A: выпустить релиз через GitHub Actions

1. Откройте GitHub -> `Actions` -> `Build`.
2. Нажмите `Run workflow`.
3. В поле `Tag version to release` укажите версию без `v`, например `1.2.1`.
4. Запустите workflow и дождитесь завершения.

Workflow соберёт артефакты, создаст GitHub Release и загрузит файлы в релиз. Приложение при следующем запуске проверит `releases/latest`, увидит новую версию и предложит пользователю скачать обновление.

## 7. Вариант B: ручной релиз без GitHub Actions

Если GitHub Actions заблокированы биллингом, можно выпустить релиз вручную:

```powershell
npx --yes pnpm@10.33.0 updater
```

После этого откройте GitHub -> `Releases` -> `Draft a new release`:

- `Tag`: версия без `v`, например `1.2.1`
- `Target`: `main`
- `Title`: `1.2.1`
- `Description`: содержимое `changelog.md`
- `Assets`: загрузите `latest.yml`, `dist/GUAR Clash_x64-setup.exe`, `dist/GUAR Clash_x64-portable.7z`

Опубликуйте релиз. Приложение увидит новую версию через GitHub Releases API и предложит пользователю скачать установщик.

## 8. Что важно для безопасных обновлений

- Не меняйте `appId` в `electron-builder.yml`, иначе Windows будет считать приложение другим продуктом.
- Не меняйте `productName` без необходимости, иначе имена установщика и путь установки могут отличаться.
- Не удаляйте миграции и текущую папку `userData`, в ней хранятся подписки и настройки пользователей.
- Публикуйте релизы только в `GUAR-GH/koala-clash-guar-styled`, потому что проверка обновлений смотрит именно туда.
- Для публичного релиза используйте обычную версию `1.2.1`, а не `1.2.1-beta`.
