## 1.4.0

- В Настройки добавлен переключатель режимов «Правила / Глобальный»
- Добавлен переключатель «Авто-обновление подписки»
- Добавлена секция «Профили» с выбором слота 1/2/3 и кнопкой «Изменить конфиг» (внешний редактор)
- Модель профилей упрощена до 3 фиксированных слотов: слот 1 — подписка (только чтение, перезаписывается при обновлении), слоты 2/3 — локальные копии для ручного редактирования
- При обновлении подписки активный профиль сбрасывается на слот 1, чтобы не затирать правки пользователя в слотах 2/3
- Удалена отдельная страница Profiles, выбор профиля перенесён в Настройки
- Убран автосброс режима «Глобальный» при запуске/загрузке
- Обновлено ядро mihomo до актуальной версии

## 1.3.0

- Добавлена кнопка импорта подписки из буфера обмена
- Реализовано переключение темы (день/ночь) через Switch
- Обновлены иконки приложения для Windows
- Улучшена работа автозапуска
- Исправления UI и локализации

## 1.2.3

- fixed release version metadata so the installed app reports 1.2.3
- rebuilt Windows installer and portable package for the 1.2.3 release

## 1.2.0

- reduced memory usage
- fix problem with deeplink alert after restart with autostart enabled
- implement hot reloading config
- fix bug with adding a rule at the end
- fixed an issue with retrieving data via a proxy
- fixed an issue with profile updates (please test)
- ui fixes
- other optimizations