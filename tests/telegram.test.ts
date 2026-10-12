import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.doUnmock("@twa-dev/sdk");
  vi.resetModules();
});
it("недоступный SDK не вызывает TypeError и не включает fallback", async () => {
  vi.resetModules();
  vi.doMock("@twa-dev/sdk", () => ({ default: undefined }));
  const tg = await import("../src/telegram");
  expect(() => tg.createRepository()).toThrow("SDK недоступен");
  expect(() => tg.initTelegram()).toThrow("SDK недоступен");
  expect(() => tg.haptic()).not.toThrow();
  expect(() => tg.telegramBack(() => {})).not.toThrow();
});
