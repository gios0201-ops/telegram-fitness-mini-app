import { expect, test, type Page } from "@playwright/test";
import { telegram } from "./telegram";
import { initialPlan } from "../../src/domain";
async function program(page: Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Тренировки", exact: true })
    .click();
}
async function open(page: Page, name = /Жим штанги лёжа/) {
  await program(page);
  await page.getByRole("button", { name }).click();
  await expect(
    page.getByRole("heading", { name: "Записать подход", exact: true }),
  ).toBeVisible();
}
async function record(page: Page, kg = "80", reps = "6", note = "") {
  await page.getByLabel("Вес, кг", { exact: true }).fill(kg);
  await page.getByLabel("Повторения", { exact: true }).fill(reps);
  await page.getByLabel("Заметка", { exact: true }).fill(note);
  await page
    .getByRole("button", { name: "Записать подход", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
}
test("полный PPL, диапазоны и отдельный экран вместо общей формы", async ({
  page,
}) => {
  await page.goto("./");
  await program(page);
  await expect(page.locator(".exercise-tile")).toHaveCount(8);
  await expect(
    page.locator(".exercise-list").getByText("Грудь · 3–4 × 6–10", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Вес, кг", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Pull", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(8);
  await expect(
    page.getByRole("button", { name: /Подтягивания широким хватом/ }),
  ).toContainText("технического отказа");
  await page.getByRole("button", { name: "Legs", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(7);
  await page.getByRole("button", { name: /Приседания со штангой/ }).click();
  await expect(
    page.getByRole("heading", { name: "Приседания со штангой" }),
  ).toBeVisible();
  await expect(page.getByLabel("Вес, кг", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Повторения", { exact: true })).toHaveValue("6");
  await page.getByRole("button", { name: "← Назад к программе" }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(7);
});
test("три подхода, последний результат отдельно от рекорда, подстановка и повтор", async ({
  page,
}) => {
  await telegram(page);
  await open(page);
  await record(page, "100", "5", "Тяжёлый");
  await expect(page.getByTestId("today-set-count")).toHaveText("1");
  await record(page, "70", "8", "Легче");
  await page.getByRole("button", { name: "Подставить", exact: true }).click();
  await expect(page.getByLabel("Вес, кг", { exact: true })).toHaveValue("70");
  await expect(page.getByLabel("Повторения", { exact: true })).toHaveValue("8");
  await page.getByRole("button", { name: "Повторить прошлый подход" }).click();
  await expect(page.getByTestId("today-set-count")).toHaveText("3");
  await expect(page.getByTestId("analysis-count")).toHaveText("3");
  await expect(page.getByTestId("analysis-volume")).toHaveText(
    "1620 кг × повт.",
  );
  await expect(
    page.locator(".exercise-analysis").getByText("100 кг", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Последний результат: 70 кг × 8/)).toBeVisible();
  await page.reload();
  await open(page);
  await expect(page.getByTestId("analysis-count")).toHaveText("3");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("исправление и удаление с подтверждением сохраняются после перезагрузки", async ({
  page,
}) => {
  await page.goto("./");
  await open(page);
  await record(page, "80", "6", "Первый");
  await page.getByRole("button", { name: "Изменить подход" }).click();
  await page.getByLabel("Исправленный вес, кг").fill("85");
  await page.getByLabel("Исправленные повторения").fill("7");
  await page.getByLabel("Исправленная заметка").fill("Исправлено");
  await page.getByRole("button", { name: "Сохранить исправление" }).click();
  await expect(page.getByTestId("analysis-volume")).toHaveText(
    "595 кг × повт.",
  );
  await expect(page.getByText("Исправлено", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Удалить подход" }).click();
  await expect(page.getByTestId("analysis-count")).toHaveText("1");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Удалить подход" }).click();
  await expect(page.getByTestId("analysis-count")).toHaveText("0");
  await page.reload();
  await open(page);
  await expect(page.getByTestId("analysis-count")).toHaveText("0");
});
test("переименование сохраняет ID и историю после повторного открытия", async ({
  page,
}) => {
  await page.goto("./");
  await open(page);
  await record(page);
  await page.getByRole("button", { name: "← Назад к программе" }).click();
  await page
    .getByRole("button", { name: "Редактировать", exact: true })
    .click();
  await page.getByLabel("Упражнение 1", { exact: true }).fill("Мой жим");
  await page.getByRole("button", { name: "Сохранить программу" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await page.reload();
  await open(page, /Мой жим/);
  await expect(page.getByTestId("analysis-count")).toHaveText("1");
  await expect(page.getByText(/Последний результат: 80 кг × 6/)).toBeVisible();
});
test("узкий iPhone: черновик сохраняется при возврате, поля и схема помещаются", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 690 });
  await page.goto("./");
  await open(page);
  await page.getByLabel("Вес, кг", { exact: true }).fill("42.5");
  await page.getByLabel("Заметка", { exact: true }).fill("Черновик");
  await page.getByRole("button", { name: "← Назад к программе" }).click();
  await page.getByRole("button", { name: /Жим штанги лёжа/ }).click();
  await expect(page.getByLabel("Вес, кг", { exact: true })).toHaveValue("42.5");
  await expect(page.getByLabel("Заметка", { exact: true })).toHaveValue(
    "Черновик",
  );
  expect(
    await page
      .getByLabel("Вес, кг", { exact: true })
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/iphone-exercise.png",
    fullPage: true,
  });
});
test("ошибка CloudStorage не подтверждает подход и не стирает черновик", async ({
  page,
}) => {
  await telegram(page, true);
  await open(page);
  await page.getByLabel("Вес, кг", { exact: true }).fill("80");
  await page
    .getByLabel("Заметка", { exact: true })
    .fill("Сохранить после восстановления");
  await page
    .getByRole("button", { name: "Записать подход", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("CloudStorage");
  await expect(page.getByTestId("analysis-count")).toHaveText("0");
  await expect(page.getByLabel("Вес, кг", { exact: true })).toHaveValue("80");
  await expect(page.getByText("Сохранено", { exact: true })).toHaveCount(0);
});
test("совместимость v1: пользовательский план сохранён, архив не перезаписан, история переживает переименование", async ({
  page,
}) => {
  const old = JSON.stringify({
    date: "2026-10-10",
    day: "Push",
    exercises: [
      { name: "Жим лёжа", muscle: "chest", sets: [{ kg: 60, reps: 8 }] },
    ],
  });
  await telegram(page, false, {
    fit_v1_plan: JSON.stringify(initialPlan),
    fit_v1_session_old: old,
  });
  await program(page);
  await expect(page.locator(".exercise-tile")).toHaveCount(3);
  await page.getByRole("button", { name: /Жим лёжа/ }).click();
  await expect(page.getByTestId("analysis-count")).toHaveText("1");
  await record(page, "65", "7");
  await expect(page.getByTestId("analysis-count")).toHaveText("2");
  await page.getByRole("button", { name: "← Назад к программе" }).click();
  await page
    .getByRole("button", { name: "Редактировать", exact: true })
    .click();
  await page
    .getByLabel("Упражнение 1", { exact: true })
    .fill("Старый жим переименован");
  await page.getByRole("button", { name: "Сохранить программу" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await page.reload();
  await open(page, /Старый жим переименован/);
  await expect(page.getByTestId("analysis-count")).toHaveText("2");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("test-cloud")!).fit_v1_session_old,
    ),
  ).toBe(old);
});
test("быстрое повторное нажатие создаёт один подход", async ({ page }) => {
  await telegram(page);
  await open(page);
  await page.getByLabel("Вес, кг", { exact: true }).fill("80");
  await page
    .getByRole("button", { name: "Записать подход", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
      button.click();
    });
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await expect(page.getByTestId("analysis-count")).toHaveText("1");
});
test("редактируемое расписание не мешает ручному выбору дня", async ({
  page,
}) => {
  await page.goto("./");
  await program(page);
  await page.getByText("Расписание недели", { exact: true }).click();
  await page.getByLabel("Понедельник", { exact: true }).selectOption("Legs");
  await page.getByRole("button", { name: "Сохранить расписание" }).click();
  await expect(page.getByRole("status")).toContainText("Сохранено");
  await page.reload();
  await program(page);
  await page.getByText("Расписание недели", { exact: true }).click();
  await expect(page.getByLabel("Понедельник", { exact: true })).toHaveValue(
    "Legs",
  );
  await page.getByRole("button", { name: "Pull", exact: true }).click();
  await expect(page.locator(".exercise-tile")).toHaveCount(8);
});

test("конфликт правок сохраняет обе версии и разрешается выбором пользователя", async ({
  page,
}) => {
  const value = {
    id: "test-set",
    exerciseId: "bench",
    name: "Жим",
    muscle: "chest",
    date: "2026-10-12",
    day: "Push",
    workoutId: "2026-10-12_Push",
    kg: 80,
    reps: 6,
    note: "",
    createdAt: "2026-10-12T10:00:00.000Z",
  };
  const base = {
    id: crypto.randomUUID(),
    target: value.id,
    parents: [],
    value,
  };
  const left = {
    id: crypto.randomUUID(),
    target: value.id,
    parents: [base.id],
    value: { ...value, kg: 85 },
  };
  const right = {
    id: crypto.randomUUID(),
    target: value.id,
    parents: [base.id],
    value: { ...value, kg: 90 },
  };
  await telegram(page, false, {
    fit_v2_log_base: JSON.stringify({ date: value.date, events: [base] }),
    fit_v2_log_left: JSON.stringify({ date: value.date, events: [left] }),
    fit_v2_log_right: JSON.stringify({ date: value.date, events: [right] }),
  });
  await open(page);
  await expect(
    page.getByRole("heading", { name: "Конфликт изменений" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "90 кг × 6 ·", exact: true }).click();
  await expect(page.getByTestId("analysis-volume")).toHaveText(
    "540 кг × повт.",
  );
  await expect(
    page.getByRole("heading", { name: "Конфликт изменений" }),
  ).toHaveCount(0);
  await page.reload();
  await open(page);
  await expect(page.getByTestId("analysis-count")).toHaveText("1");
});
test("неопознанное упражнение v1 остаётся в архиве и связывается вручную", async ({
  page,
}) => {
  const raw = JSON.stringify({
    date: "2026-10-10",
    day: "Push",
    exercises: [
      { name: "Архивный жим", muscle: "chest", sets: [{ kg: 60, reps: 8 }] },
    ],
  });
  await telegram(page, false, { fit_v1_session_unknown: raw });
  await program(page);
  await page.getByRole("button", { name: "Архивный жим · Push" }).click();
  await expect(page.getByTestId("analysis-count")).toHaveText("1");
  await page.getByLabel("Упражнение для архива").selectOption("bench");
  await page.getByRole("button", { name: "Связать подходы" }).click();
  await expect(page.getByTestId("analysis-count")).toHaveText("0");
  await page.getByRole("button", { name: "← Назад к программе" }).click();
  await page.getByRole("button", { name: /Жим штанги лёжа/ }).click();
  await expect(page.getByTestId("analysis-count")).toHaveText("1");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("test-cloud")!)
          .fit_v1_session_unknown,
    ),
  ).toBe(raw);
});
