import { expect, it, vi } from "vitest";
// @ts-expect-error Node-only operational script deliberately stays outside client TypeScript.
import { setup, validateUrl } from "../scripts/setup-bot.mjs";
const env = {
  MINI_APP_URL: "https://example.github.io/fitness/",
  EXPECTED_BOT_ID: "123",
  BOT_TOKEN: "123:fake_test_token",
};
it("dry-run никогда не вызывает Bot API", async () => {
  const fetcher = vi.fn();
  expect((await setup({ env, fetcher })).dryRun).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
it("отклоняет небезопасный URL", () => {
  for (const url of [
    "http://example.github.io/",
    "https://example.github.io.evil.test/",
    "https://user:pass@example.github.io/",
  ])
    expect(() => validateUrl(url)).toThrow();
});
it("проверяет бота до любых изменений", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { id: 456 } }),
    });
  await expect(setup({ env, apply: true, fetcher })).rejects.toThrow("ID бота");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("сохраняет другие команды и backup до мутаций", async () => {
  const calls: string[] = [];
  const old = [{ command: "help", description: "Помощь" }];
  const fetcher = vi.fn(async (url: string, options: { body: string }) => {
    const method = url.split("/").at(-1)!;
    calls.push(method);
    const results: Record<string, unknown> = {
      getMe: { id: 123 },
      getMyCommands: old,
      getChatMenuButton: { type: "default" },
      setMyCommands: true,
      setChatMenuButton: true,
    };
    if (method === "setMyCommands")
      expect(JSON.parse(options.body).commands[0]).toEqual(old[0]);
    return {
      ok: true,
      json: async () => ({ ok: true, result: results[method] }),
    };
  });
  await setup({
    env,
    apply: true,
    fetcher,
    backup: async () => {
      calls.push("backup");
    },
  });
  expect(calls).toEqual([
    "getMe",
    "getMyCommands",
    "getChatMenuButton",
    "backup",
    "setMyCommands",
    "setChatMenuButton",
  ]);
});
it("не выводит токен в исключении сети", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValue(
      new Error(`https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`),
    );
  try {
    await setup({ env, apply: true, fetcher });
    throw new Error("expected failure");
  } catch (e) {
    expect(String(e)).not.toContain(env.BOT_TOKEN);
  }
});
