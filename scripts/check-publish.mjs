import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// Include new source files before staging; respect Git ignore rules.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
if (!files.length)
  throw new Error("Нет файлов в Git index для проверки публикации.");
const rules = [
  ["Telegram token", /\b\d{6,}:[A-Za-z0-9_-]{25,}\b/],
  [
    "GitHub token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/,
  ],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["credentials in URL", /https?:\/\/[^\s/:@]+:[^\s/@]+@/],
  ["private workstation path", /\/(?:home|Users)\/[A-Za-z][A-Za-z0-9_.-]*\//],
  ["email address", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
];
const findings = [];
for (const file of files) {
  if (
    /(^|\/)(?:node_modules|dist|bot-backups|uploads|test-results|playwright-report)(\/|$)/.test(
      file,
    ) ||
    (/(^|\/)\.env(?:$|\.)/.test(file) && file !== ".env.example") ||
    /\.(?:pem|key|p12|pfx|sqlite|db|zip|tar|gz)$/i.test(file)
  )
    findings.push(`${file}: запрещённый для публикации файл`);
  let content = await readFile(file, "utf8");
  // This exact synthetic URL tests that setup rejects credentials; it is not a real login.
  if (file === "tests/setup-bot.test.ts")
    content = content.replaceAll(
      "https://" + "user:pass" + "@" + "example.github.io/",
      "https://example.github.io/",
    );
  for (const [label, pattern] of rules)
    if (pattern.test(content)) findings.push(`${file}: ${label}`);
}
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${files.length} файлов Git; известных шаблонов секретов, email и приватных путей не найдено. Демо-данные и тестовые fixtures требуют отдельного ручного review.`,
  );
}
