import SDK from "@twa-dev/sdk";
import { cloudStore, demoStore, Repository } from "./storage";
// The SDK is CommonJS: Vite dev/build can expose its default export differently.
const WebApp: typeof SDK =
  (SDK as unknown as { default?: typeof SDK } | undefined)?.default ?? SDK;
export function createRepository(): {
  repo: Repository;
  mode: "telegram" | "demo";
} {
  if (!WebApp)
    throw new Error("Telegram SDK недоступен. Перезапустите приложение.");
  // Never use a user id from URL/initDataUnsafe as an authorization boundary.
  // Telegram itself isolates CloudStorage by the current user and bot.
  if (WebApp.initData || WebApp.platform !== "unknown") {
    if (!WebApp.isVersionAtLeast("6.9"))
      throw new Error(
        "Обновите Telegram: CloudStorage требует версию Mini Apps 6.9+.",
      );
    return {
      repo: new Repository(cloudStore(WebApp.CloudStorage)),
      mode: "telegram",
    };
  }
  return { repo: new Repository(demoStore(localStorage)), mode: "demo" };
}
export function initTelegram() {
  if (!WebApp) throw new Error("Telegram SDK недоступен.");
  if (!WebApp.initData && WebApp.platform === "unknown") return () => {};
  const theme = () => {
    document.documentElement.dataset.theme = WebApp.colorScheme;
    const p = WebApp.themeParams;
    const colors = {
      "--bg": p.bg_color,
      "--card": p.secondary_bg_color,
      "--text": p.text_color,
      "--muted": p.hint_color,
      "--accent": p.button_color,
      "--on-accent": p.button_text_color,
    };
    for (const [k, v] of Object.entries(colors))
      if (v) document.documentElement.style.setProperty(k, v);
  };
  theme();
  WebApp.onEvent("themeChanged", theme);
  WebApp.ready();
  WebApp.expand();
  return () => WebApp.offEvent("themeChanged", theme);
}
export function haptic(success = true) {
  try {
    if (WebApp.isVersionAtLeast("6.1") && WebApp.platform !== "unknown")
      WebApp.HapticFeedback.notificationOccurred(success ? "success" : "error");
  } catch {
    /* Optional device feature. */
  }
}

export function telegramBack(back: () => void) {
  try {
    if (
      !WebApp ||
      WebApp.platform === "unknown" ||
      !WebApp.isVersionAtLeast("6.1")
    )
      return () => {};
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(back);
    return () => {
      WebApp.BackButton.offClick(back);
      WebApp.BackButton.hide();
    };
  } catch {
    return () => {};
  }
}
