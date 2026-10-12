import { test, expect } from "@playwright/test";
import { telegram } from "./telegram";
import { initialPlan } from "../../src/domain";
const nav = (page: import("@playwright/test").Page, name: string) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
test("сокращённый план устанавливается только после подтверждения; история сохранена", async ({
  page,
}) => {
  const raw = JSON.stringify(initialPlan);
  await telegram(
    page,
    false,
    {
      fit_v1_plan: raw,
      fit_v1_session_old: JSON.stringify({
        date: "2026-10-01",
        day: "Push",
        exercises: [
          { name: "Жим лёжа", muscle: "chest", sets: [{ kg: 80, reps: 8 }] },
        ],
      }),
    },
    "ios",
  );
  await nav(page, "Тренировки");
  await expect(page.locator(".exercise-tile")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Установить полный PPL-план", exact: true })
    .click();
  await expect(page.locator(".exercise-tile")).toHaveCount(3);
  await page.getByRole("button", { name: "Отмена установки" }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Установить полный PPL-план", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить установку полного плана" })
    .click();
  await expect(page.locator(".exercise-tile")).toHaveCount(8);
  await page.locator(".exercise-tile").first().click();
  await expect(
    page.getByText("80 кг × 8", { exact: false }).first(),
  ).toBeVisible();
  await page.reload();
  await nav(page, "Тренировки");
  await expect(page.locator(".exercise-tile")).toHaveCount(8);
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("test-cloud")!).fit_v1_plan,
    ),
  ).toBe(raw);
});
for (const width of [320, 375, 390, 430])
  test(`мобильные экраны ${width}: группы, формы, отсутствие переполнения`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    const labels = ["Сегодня", "Тренировки", "Питание", "Прогресс", "Профиль"];
    for (let i = 0; i < labels.length; i++) {
      await nav(page, labels[i]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (labels[i] === "Питание") {
        await expect(page.getByRole("progressbar")).toHaveCount(4);
        await expect(page.getByLabel("Название продукта")).toHaveCount(0);
      }
      if (labels[i] === "Прогресс")
        await expect(page.getByLabel("Масса, кг")).toHaveCount(0);
      await page.screenshot({
        path: `test-results/ui-${width}/tab-${i}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
    await nav(page, "Тренировки");
    for (const [day, count, groups] of [
      ["Push", 8, ["Грудь", "Передняя и средняя дельта", "Трицепс"]],
      ["Pull", 8, ["Спина", "Бицепс", "Задняя дельта"]],
      [
        "Legs",
        7,
        ["Квадрицепсы", "Задняя поверхность бедра и ягодицы", "Икры"],
      ],
    ] as const) {
      await page.getByRole("button", { name: day, exact: true }).click();
      await expect(page.locator(".exercise-tile")).toHaveCount(count);
      for (const group of groups)
        await expect(
          page.getByRole("heading", { name: group, exact: true }),
        ).toBeVisible();
    }
    await page.locator(".exercise-tile").first().click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/ui-${width}/exercise.png`,
      fullPage: true,
      animations: "disabled",
    });
  });

test("iOS bridge: кнопка Telegram возвращает из упражнения и отдельных форм", async ({
  page,
}) => {
  await telegram(page, false, {}, "ios");
  const back = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          Telegram: { WebView: { receiveEvent: (event: string) => void } };
        }
      ).Telegram.WebView.receiveEvent("back_button_pressed"),
    );
  await nav(page, "Тренировки");
  await page.locator(".exercise-tile").first().click();
  await back();
  await expect(
    page.getByRole("heading", { name: "Мой тренировочный план" }),
  ).toBeVisible();
  await nav(page, "Питание");
  await page
    .getByRole("button", { name: "Добавить продукт", exact: true })
    .click();
  await back();
  await expect(
    page.getByRole("button", { name: "Добавить продукт", exact: true }),
  ).toBeVisible();
  await nav(page, "Прогресс");
  await page.getByRole("button", { name: "Добавить замер" }).click();
  await back();
  await expect(
    page.getByRole("button", { name: "Добавить замер" }),
  ).toBeVisible();
});
