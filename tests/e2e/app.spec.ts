import { telegram } from "./telegram";
import { expect, test, type Page } from "@playwright/test";
async function nav(page: Page, label: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: label, exact: true })
    .click();
}
test("демо: профиль, PPL, рабочие веса, график и сохранение после перезагрузки", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByText("Демо в браузере", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("3 250")).toBeVisible();
  await nav(page, "Профиль");
  await page.getByLabel("Вес, кг", { exact: true }).fill("85");
  await page.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await page.reload();
  await nav(page, "Профиль");
  await expect(page.getByLabel("Вес, кг", { exact: true })).toHaveValue("85");
  await nav(page, "Тренировки");
  await page
    .getByRole("button", { name: "Редактировать", exact: true })
    .click();
  await page.getByLabel("Упражнение 1", { exact: true }).fill("Жим тест");
  await page.getByRole("button", { name: "Сохранить программу" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await page.getByRole("button", { name: /Жим тест/ }).click();
  await expect(page.getByRole("heading", { name: "Жим тест" })).toBeVisible();
  await page.getByLabel("Вес, кг", { exact: true }).fill("60");
  await page.getByLabel("Повторения", { exact: true }).fill("8");
  await page
    .getByRole("button", { name: "Записать подход", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await page.getByRole("button", { name: "← Назад к программе" }).click();
  await nav(page, "Прогресс");
  await page.getByLabel("Дата замера").fill("2026-10-01");
  await page.getByLabel("Масса, кг").fill("80");
  await page.getByRole("button", { name: "Сохранить замер" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await page.getByLabel("Дата замера").fill("2026-10-08");
  await page.getByLabel("Масса, кг").fill("80.5");
  await page.getByRole("button", { name: "Сохранить замер" }).click();
  await expect(page.getByRole("img", { name: /График массы/ })).toBeVisible();
  await expect(page.getByText("80.5 кг", { exact: true })).toBeVisible();
  await page.locator("details.history summary").click();
  await expect(
    page.getByText("Жим тест: 60 кг × 8", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await nav(page, "Прогресс");
  await expect(page.getByRole("img", { name: /График массы/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/mobile-progress.png",
    fullPage: true,
  });
  await nav(page, "Сегодня");
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
});
test("Telegram SDK: CloudStorage, темы и отсутствие локального fallback", async ({
  page,
}) => {
  await telegram(page);
  await expect(
    page.getByRole("heading", { name: "Становись сильнее" }),
  ).toBeVisible();
  await expect(page.getByText("Демо в браузере", { exact: false })).toHaveCount(
    0,
  );
  await nav(page, "Профиль");
  await page.getByLabel("Вес, кг", { exact: true }).fill("82");
  await page.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg"),
    ),
  ).toBe("#111111");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          (window as unknown as { __cloud: Record<string, string> }).__cloud
            .fit_v1_profile,
        ).weight,
    ),
  ).toBe(82);
});
test("ошибка CloudStorage не показывает ложное сохранение", async ({
  page,
}) => {
  await telegram(page, true);
  await nav(page, "Профиль");
  await page.getByLabel("Вес, кг", { exact: true }).fill("83");
  await page.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Ошибка Telegram CloudStorage",
  );
  await expect(
    page.getByRole("button", { name: "Сохранить профиль" }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page
    .getByRole("button", { name: "Обновить данные", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Сохранить профиль" }),
  ).toBeEnabled();
});
test("темы, reduced motion и desktop", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Становись сильнее" }),
  ).toBeVisible();
  await nav(page, "Тренировки");
  await page.getByRole("button", { name: /Жим штанги лёжа/ }).click();
  await expect(
    page.getByRole("img", { name: "Авторская схема мышц: Грудь" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".exercise-screen")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.screenshot({
    path: "test-results/desktop-training.png",
    fullPage: true,
  });
});
test("смена Telegram темы и safe area во время работы", async ({ page }) => {
  await telegram(page);
  await expect(
    page.getByRole("heading", { name: "Становись сильнее" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const view = (
      window as unknown as {
        Telegram: {
          WebView: { receiveEvent: (event: string, data: unknown) => void };
        };
      }
    ).Telegram.WebView;
    view.receiveEvent("theme_changed", {
      theme_params: {
        bg_color: "#ffffff",
        text_color: "#111111",
        button_color: "#416d28",
        button_text_color: "#ffffff",
        secondary_bg_color: "#eeeeee",
        hint_color: "#666666",
      },
    });
    view.receiveEvent("safe_area_changed", {
      top: 20,
      bottom: 30,
      left: 0,
      right: 0,
    });
  });
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("light");
  expect(
    await page
      .locator(".bottom-nav")
      .evaluate((e) => getComputedStyle(e).paddingBottom),
  ).toBe("40px");
});
test("устаревший Telegram не переходит в демо", async ({ page }) => {
  await page.goto("./#tgWebAppVersion=6.8&tgWebAppPlatform=android");
  await expect(page.getByRole("alert")).toContainText("Обновите Telegram");
  await expect(page.getByText("Демо в браузере", { exact: false })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("повреждённая локальная запись сохраняется и доступна для экспорта", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("fitness-demo-v1-fit_v1_profile", "damaged"),
  );
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("повреждённая");
  await expect(
    page.getByRole("button", { name: "Экспорт JSON" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("fitness-demo-v1-fit_v1_profile"),
    ),
  ).toBe("damaged");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  expect((await download).suggestedFilename()).toMatch(/^fitness-.*\.json$/);
});

test("Telegram: дневник питания сохраняет порцию в CloudStorage без localStorage", async ({
  page,
}) => {
  await telegram(page);
  await nav(page, "Питание");
  await page.getByLabel("Название продукта").fill("Рис");
  await page.getByLabel("Масса порции, г").fill("200");
  await page.getByLabel("Ккал на 100 г").fill("130");
  await page.getByRole("button", { name: "Сохранить продукт" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  const records = await page.evaluate(() =>
    Object.entries(
      (window as unknown as { __cloud: Record<string, string> }).__cloud,
    ),
  );
  expect(records).toHaveLength(1);
  expect(records[0][0]).toMatch(/^fit_v1_food_/);
  expect(JSON.parse(records[0][1]).foods[0].grams).toBe(200);
});

test("Telegram: ошибка записи питания сохраняет форму и не сообщает успех", async ({
  page,
}) => {
  await telegram(page, true);
  await nav(page, "Питание");
  await page.getByLabel("Название продукта").fill("Рис");
  await page.getByRole("button", { name: "Сохранить продукт" }).click();
  await expect(page.getByRole("alert")).toContainText("CloudStorage");
  await expect(page.getByLabel("Название продукта")).toHaveValue("Рис");
  await expect(page.getByText("Сохранено", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
