import type { Page } from "@playwright/test";
// Mock the native bridge, exercising the real bundled Telegram SDK rather than a replaced repository.
export async function telegram(
  page: Page,
  failSave = false,
  seed: Record<string, string> = {},
) {
  await page.addInitScript(
    ({ failSave, seed }) => {
      const w = window as unknown as {
        TelegramWebviewProxy: unknown;
        Telegram: {
          WebView: { receiveEvent: (event: string, data: unknown) => void };
        };
        __cloud: Record<string, string>;
      };
      w.__cloud = JSON.parse(
        sessionStorage.getItem("test-cloud") || JSON.stringify(seed),
      );
      w.TelegramWebviewProxy = {
        postEvent(event: string, payload: string) {
          if (event !== "web_app_invoke_custom_method") return;
          const data = JSON.parse(payload);
          let result: unknown;
          let error: string | undefined;
          const p = data.params;
          if (data.method === "getStorageKeys") result = Object.keys(w.__cloud);
          else if (data.method === "getStorageValues")
            result = Object.fromEntries(
              p.keys.map((k: string) => [k, w.__cloud[k] || ""]),
            );
          else if (data.method === "saveStorageValue") {
            if (failSave) error = "offline";
            else {
              w.__cloud[p.key] = p.value;
              result = true;
            }
          } else if (data.method === "deleteStorageValues") {
            for (const k of p.keys) delete w.__cloud[k];
            result = true;
          }
          sessionStorage.setItem("test-cloud", JSON.stringify(w.__cloud));
          setTimeout(
            () =>
              w.Telegram.WebView.receiveEvent("custom_method_invoked", {
                req_id: data.req_id,
                result,
                error,
              }),
            0,
          );
        },
      };
    },
    { failSave, seed },
  );
  await page.goto(
    "./#tgWebAppVersion=8.0&tgWebAppPlatform=android&tgWebAppData=" +
      encodeURIComponent(
        "user=" +
          encodeURIComponent('{"id":123,"first_name":"Тест"}') +
          "&auth_date=1&hash=test",
      ) +
      "&tgWebAppThemeParams=" +
      encodeURIComponent(
        '{"bg_color":"#111111","text_color":"#eeeeee","button_color":"#d0ef8c","button_text_color":"#111111","secondary_bg_color":"#222222","hint_color":"#aaaaaa"}',
      ),
  );
}
