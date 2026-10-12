import { readdir, readFile } from "node:fs/promises";
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else {
      const text = await readFile(path, "utf8");
      if (
        /\b\d{6,}:[A-Za-z0-9_-]{25,}\b|api\.telegram\.org\/bot|BOT_TOKEN|EXPECTED_BOT_ID/.test(
          text,
        )
      )
        throw new Error(
          `В клиентском файле обнаружен токен или Bot API: ${path}`,
        );
    }
  }
}
await scan("src");
await scan("dist");
console.log(
  "Клиентский source и dist: секреты/Bot API не найдены (проверка известных шаблонов).",
);
