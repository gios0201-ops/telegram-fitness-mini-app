# Публикация и проверка версии

12 октября 2026 года. Публикация доработки разрешена пользователем после успешных проверок. Используется только существующий репозиторий этого приложения.

Новая сборка публикует [release.json](https://gios0201-ops.github.io/telegram-fitness-mini-app/release.json) с полным commit SHA из `GITHUB_SHA`. В интерфейсе SHA показан внизу страницы. Чтобы определить фактически опубликованную ревизию, сравните этот файл с `head_sha` последнего успешного [Pages workflow](https://github.com/gios0201-ops/telegram-fitness-mini-app/actions/workflows/pages.yml): jobs `test-build` и `deploy` должны быть успешными. Затем проверьте HTTPS HTML/JS/CSS и откройте вкладку «Питание», программу 8/8/7 и отдельный экран упражнения. Наличие локальных изменений или одного успешного build job не доказывает публикацию.

Настройки ObolonkoGYM не изменяются. Workflow Pages сохранён, одноразовый setup-бота не запускается. Локальная проверка новой версии описана в [verification.md](verification.md), хранение — в [training-compatibility.md](training-compatibility.md).

## Исторический отчёт первой публикации

Создан отдельный публичный репозиторий; остальные репозитории не изменялись. Числа и ссылки ниже относятся к первой версии.

- Репозиторий: https://github.com/gios0201-ops/telegram-fitness-mini-app
- Mini App: https://gios0201-ops.github.io/telegram-fitness-mini-app/
- Первый опубликованный commit: `fb999e717497a8adffceaa47908fca297fed443b`.
- [Первый Pages workflow](https://github.com/gios0201-ops/telegram-fitness-mini-app/actions/runs/38243866232): **success**; оба jobs `test-build` и `deploy` прошли.

Этот исторический отчёт фиксирует исходную live-проверку; новая ревизия проверяется через release.json и её собственный workflow.

## Фактические проверки

| Проверка                                                    | Результат                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Видимость репозитория / default branch                      | `PUBLIC` / `main`                                                               |
| Pages API                                                   | `build_type=workflow`, `https_enforced=true`                                    |
| GitHub Actions                                              | Node `v22.23.3`, unit tests **26 passed**                                       |
| Playwright в Actions                                        | Dev **7 passed**, готовая Pages-сборка **7 passed**                             |
| TypeScript, production build, проверки публикации и клиента | PASS                                                                            |
| HTTPS HTML                                                  | HTTP **200**                                                                    |
| JS/CSS                                                      | HTTP **200**, правильные MIME types и пути `/telegram-fitness-mini-app/assets/` |
| SHA256 JS/CSS                                               | Совпадают с локальной сборкой того же исходного кода                            |
| Браузерный smoke живого URL                                 | UI отрисован, навигация работает, демо-профиль сохраняется после reload         |
| Ошибки JS / горизонтальное переполнение                     | Не обнаружены в проверенном мобильном сценарии                                  |

Перед первым commit проверены все публикуемые файлы, `.gitignore`, исходный код, демонстрационные данные и тестовые fixtures. В репозиторий не попали `.env`, пользовательские записи, CloudStorage exports, bot backups, локальные screenshots, credentials или приватные пути. Commit использует GitHub noreply email; глобальная Git-конфигурация не менялась. `check:publish` повторяется в CI. Шаблонная проверка секретов дополнена ручным просмотром; абсолютной гарантии от произвольных секретов один regex scanner не даёт.

GitHub сообщил не блокирующее выполнение предупреждение: некоторые используемые actions изначально на Node 20 принудительно запускаются на Node 24. Тесты приложения выполнялись на Node 22, оба jobs завершились успешно.

## Telegram: только dry-run

- Локально выполнен `setup-bot.mjs --dry-run` с опубликованным URL.
- [Workflow dry-run](https://github.com/gios0201-ops/telegram-fitness-mini-app/actions/runs/38244182608): **success**, `apply=false`.
- Шаг `Apply explicit configuration` пропущен. Bot API не вызывался, токен не предоставлялся, настройки бота не изменялись.
- В новом репозитории задана только публичная variable `MINI_APP_URL`; environment `telegram-setup` создан dry-run workflow. `BOT_TOKEN` и `EXPECTED_BOT_ID` не настраивались.

Для подключения нужно выбрать бота и получить отдельное разрешение на изменение menu button/команд. После разрешения можно установить URL через BotFather либо безопасно задать `BOT_TOKEN` и `EXPECTED_BOT_ID` и выполнить скрипт с `--apply`. Скрипт создаёт backup прежних настроек до изменений. Для GitHub Secrets используйте environment `telegram-setup`; перед добавлением токена рекомендуется ограничить environment веткой `main` и настроить required reviewers. Токен не передавайте в чат или клиентские env-переменные.

Без обработчика сообщений `/start` не отвечает автоматически; доступная точка входа — menu button/Main Mini App. VPS, Docker и постоянные серверные процессы не создавались.

## Граница проверки

Проверена реальная публикация и работа страницы в обычном браузере. Native Telegram bridge в E2E остаётся тестовым: проверка двух реальных аккаунтов, синхронизации устройств, Android/iOS/Desktop WebView и физических haptics требует подключения бота и отдельного теста внутри Telegram.
