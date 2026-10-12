import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export function validateUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith(".github.io")
  )
    throw new Error(
      "Нужен HTTPS URL GitHub Pages без параметров, фрагмента и credentials.",
    );
  return url.href;
}
export async function setup({
  env = process.env,
  apply = false,
  fetcher = fetch,
  backup = async (value) => {
    await mkdir("bot-backups", { recursive: true });
    await writeFile(
      `bot-backups/${Date.now()}.json`,
      JSON.stringify(value, null, 2),
      { flag: "wx", mode: 0o600 },
    );
  },
} = {}) {
  const url = validateUrl(env.MINI_APP_URL || "");
  if (!apply)
    return {
      dryRun: true,
      url,
      changes: [
        "Добавить /start, сохраняя существующие команды",
        "Назначить menu button «Открыть Рост»",
      ],
      note: "Автоответ на /start не создаётся. Ни одного запроса к Bot API.",
    };
  if (
    !/^\d+$/.test(env.EXPECTED_BOT_ID || "") ||
    !/^\d+:[A-Za-z0-9_-]+$/.test(env.BOT_TOKEN || "")
  )
    throw new Error(
      "Для --apply нужны BOT_TOKEN и EXPECTED_BOT_ID в окружении.",
    );
  const call = async (method, body = {}) => {
    let result;
    try {
      const response = await fetcher(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error("HTTP");
      result = await response.json();
    } catch {
      throw new Error(
        `Bot API ${method}: запрос не завершён. Проверьте состояние перед повтором. Токен скрыт.`,
      );
    }
    if (!result.ok)
      throw new Error(`Bot API ${method}: операция отклонена. Токен скрыт.`);
    return result.result;
  };
  const me = await call("getMe");
  if (String(me.id) !== env.EXPECTED_BOT_ID)
    throw new Error(
      "ID бота не совпадает с EXPECTED_BOT_ID. Изменения отменены.",
    );
  const commands = await call("getMyCommands");
  const menu = await call("getChatMenuButton");
  if (!Array.isArray(commands))
    throw new Error("Не удалось прочитать существующие команды.");
  const merged = commands.some((c) => c.command === "start")
    ? commands
    : [
        ...commands,
        {
          command: "start",
          description: "Откройте приложение кнопкой меню «Открыть Рост»",
        },
      ];
  if (merged.length > 100)
    throw new Error("Нет места для новой команды. Изменения отменены.");
  // Save old defaults before the first mutation; existing scoped commands/webhook are untouched.
  await backup({
    botId: me.id,
    username: me.username,
    commands,
    menu,
    capturedAt: new Date().toISOString(),
  });
  await call("setMyCommands", { commands: merged });
  try {
    await call("setChatMenuButton", {
      menu_button: { type: "web_app", text: "Открыть Рост", web_app: { url } },
    });
  } catch {
    throw new Error(
      "Команды настроены, menu button не подтверждён. Возможен частичный результат. Старые настройки в bot-backups; проверьте бота перед повтором.",
    );
  }
  return {
    applied: true,
    botId: me.id,
    username: me.username,
    url,
    note: "Настроены только команда и menu button; обработчик /start отсутствует.",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const flags = process.argv.slice(2);
    if (
      flags.some((f) => !["--apply", "--dry-run"].includes(f)) ||
      (flags.includes("--apply") && flags.includes("--dry-run"))
    )
      throw new Error(
        "Используйте --dry-run или --apply; секреты передаются только окружением.",
      );
    console.log(
      JSON.stringify(
        await setup({ apply: flags.includes("--apply") }),
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(
      e instanceof Error ? e.message : "Ошибка настройки. Токен скрыт.",
    );
    process.exitCode = 1;
  }
}
