import { test, expect } from "@playwright/test";
test("питание: порция, редактирование, повторное открытие, удаление", async ({
  page,
}) => {
  await page.goto("./");
  const open = async () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Питание", exact: true })
      .click();
  await open();
  await page
    .getByRole("button", { name: "Добавить продукт", exact: true })
    .click();
  await page.getByLabel("Название продукта").fill("Овсянка");
  await page.getByLabel("Масса порции, г").fill("150");
  await page.getByLabel("Ккал на 100 г").fill("370");
  await page.getByLabel("Белки на 100 г").fill("13");
  await page.getByLabel("Жиры на 100 г").fill("7");
  await page.getByLabel("Углеводы на 100 г").fill("60");
  await page.getByRole("button", { name: "Сохранить продукт" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await expect(
    page.getByText("555 ккал · Б 19.5 · Ж 10.5 · У 90.0"),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Ккал", exact: true }),
  ).toHaveAttribute("value", "555");
  await expect(
    page.getByRole("progressbar", { name: "Ккал", exact: true }),
  ).toHaveAttribute("max", "3250");
  await page.reload();
  await open();
  await page.getByRole("button", { name: "Изменить Овсянка" }).click();
  await page.getByLabel("Масса порции, г").fill("100");
  await page.getByRole("button", { name: "Сохранить продукт" }).click();
  await expect(
    page.getByText("370 ккал · Б 13.0 · Ж 7.0 · У 60.0"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-nutrition.png",
    fullPage: true,
  });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Удалить Овсянка" }).click();
  await expect(page.getByText("Записей пока нет.")).toBeVisible();
});
