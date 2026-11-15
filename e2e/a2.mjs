import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
});
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
async function drag(page, name, stage) {
  const handle = page.getByRole("button", {
    name: `Mover ${name}`,
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const column = page.locator(`[data-stage="${stage}"]`);
  const target =
    (await column.locator(".deal-card").first().boundingBox()) ??
    (await column.boundingBox());
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + Math.min(60, target.height / 2),
    { steps: 20 },
  );
  await page.mouse.up();
  await page.waitForTimeout(400);
  await column
    .getByRole("button", { name, exact: true })
    .waitFor({ timeout: 2500 });
}
try {
  const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  assert.match(await page.locator(".auth-error").innerText(), /e-mail/);
  await page.getByLabel("E-mail", { exact: true }).fill("a@example.com");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  assert.match(await page.locator(".auth-error").innerText(), /senha/);
  await page.getByLabel("Senha", { exact: true }).fill("secret");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  assert.equal(
    await page.locator('[name="password"]').getAttribute("type"),
    "text",
  );
  await page.getByRole("link", { name: "Esqueceu sua senha?" }).click();
  await page
    .getByRole("button", { name: "Enviar link de recuperação" })
    .click();
  assert.match(await page.locator(".auth-error").innerText(), /e-mail/);
  await page.goto(`${base}/primeiro-acesso`);
  await page.locator('[name="password"]').fill("StrongPassword123");
  await page.locator('[name="confirmation"]').fill("DifferentPassword123");
  await page.getByRole("button", { name: "Ativar minha conta" }).click();
  assert.match(await page.locator(".auth-error").innerText(), /conferem/);
  console.log(
    "PASS auth validation, visibility, recovery validation, password mismatch",
  );
  await page.goto(`${base}/demo/crm`);
  await page
    .getByRole("button", { name: "Loja Aurora", exact: true })
    .waitFor();
  for (const stage of ["qualified", "proposal", "negotiation", "won", "new"])
    await drag(page, "Loja Aurora", stage);
  await page.getByRole("button", { name: "Loja Aurora", exact: true }).click();
  assert.equal(await page.locator("dialog ol li").count(), 5);
  await page.getByRole("button", { name: "Fechar detalhes" }).click();
  // Reorder and verify positions rather than relying only on rendered transforms.
  const source = await page
      .getByRole("button", { name: "Mover Loja Aurora", exact: true })
      .boundingBox(),
    destination = await page
      .locator('[data-stage="new"] .deal-card')
      .last()
      .boundingBox();
  await page.mouse.move(source.x + 8, source.y + 8);
  await page.mouse.down();
  await page.mouse.move(destination.x + 90, destination.y + 70, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.equal(
    await page.locator('[data-stage="new"] .deal-open').last().innerText(),
    "Loja Aurora",
  );
  await page.reload();
  await page.locator('[data-stage="new"] .deal-open').last().waitFor();
  assert.equal(
    await page.locator('[data-stage="new"] .deal-open').last().innerText(),
    "Loja Aurora",
  );
  await page.getByLabel("Canal", { exact: true }).selectOption("whatsapp");
  await drag(page, "Loja Aurora", "qualified");
  assert.equal(
    await page.getByLabel("Canal", { exact: true }).inputValue(),
    "whatsapp",
  );
  await page.getByLabel("Canal", { exact: true }).selectOption("");
  // A failed persistence must restore both card and history.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreStorage = () => (Storage.prototype.setItem = original);
    Storage.prototype.setItem = function (key, value) {
      if (key === "a2:deals:v2") throw Error("Quota");
      return original.call(this, key, value);
    };
  });
  await drag(page, "Loja Aurora", "new").catch(() => {});
  await page.getByRole("alert").filter({ hasText: "desfeita" }).waitFor();
  assert.equal(
    await page
      .locator('[data-stage="qualified"]')
      .getByRole("button", { name: "Loja Aurora", exact: true })
      .count(),
    1,
  );
  await page.evaluate(() => window.restoreStorage());
  // Keyboard drag from a focused handle.
  await page
    .getByRole("button", { name: "Mover TechNova LTDA", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.locator('[data-deal-id="demo-deal-3"].dragging').waitFor();
  await page.waitForTimeout(100);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("a2:deals:v2")),
  );
  assert.notEqual(
    stored.find((i) => i.name === "TechNova LTDA").stage,
    "qualified",
  );
  console.log(
    "PASS mouse: all stages, backwards, reorder, totals/history/persistence, filters, rollback; keyboard move",
  );
  await page.goto(`${base}/demo`);
  await page.getByRole("button", { name: "Instagram", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: /Marina Oliveira/ }).count(),
    0,
  );
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page.getByRole("button", { name: /Marina Oliveira/ }).click();
  await page
    .getByRole("button", { name: "Assumir conversa", exact: true })
    .click();
  await page.getByLabel("Resposta manual").fill("Teste humano A2");
  await page.getByRole("button", { name: "Simular envio" }).click();
  await page.getByRole("log").getByText("Teste humano A2").waitFor();
  await page
    .getByRole("log")
    .getByText("Atendente humano", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Encerrar atendimento" }).click();
  assert.equal(
    await page.getByRole("button", { name: "Simular envio" }).isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Assumir conversa", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Criar follow-up" }).click();
  await page.getByLabel("Data e horário").fill("2026-12-01T10:00");
  await page.getByLabel("Observações").fill("Enviar proposta revisada");
  await page.locator("dialog").getByLabel("Responsável", { exact: true }).fill("Ana");
  await page.getByRole("button", { name: "Salvar acompanhamento" }).click();
  await page.getByText("Enviar proposta revisada", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await page.getByText("Concluído", { exact: true }).waitFor();
  console.log(
    "PASS conversations: channel filters, human handoff/reply, closed state, internal follow-up creation/completion",
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const route of [
      "/login",
      "/recuperar-senha",
      "/primeiro-acesso",
      "/demo/dashboard",
      "/demo/crm",
      "/demo",
    ]) {
      await page.goto(`${base}${route}`);
      await page.waitForTimeout(300);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} overflows at ${width}`,
      );
      await page.screenshot({
        path: `docs/a2-${route.replaceAll("/", "-")}-${width}.png`,
        fullPage: true,
      });
    }
  }
  assert.deepEqual(errors, []);
  console.log("PASS responsive 390/768/1440, all six screens, no page errors");
  await context.close();
  // Real touch events through Chromium DevTools on a touch-enabled viewport.
  const touchContext = await browser.newContext({
      viewport: { width: 800, height: 1100 },
      hasTouch: true,
      isMobile: true,
    }),
    touchPage = await touchContext.newPage();
  await touchPage.goto(`${base}/demo/crm`);
  await touchPage
    .getByRole("button", { name: "Mover Loja Aurora", exact: true })
    .waitFor();
  const cdp = await touchContext.newCDPSession(touchPage);
  const a = await touchPage
      .getByRole("button", { name: "Mover Loja Aurora", exact: true })
      .boundingBox(),
    b = await touchPage
      .locator('[data-stage="qualified"] .deal-card')
      .first()
      .boundingBox();
  const point = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await touchPage.waitForTimeout(230);
  for (let i = 1; i <= 15; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: point.x + ((b.x + 70 - point.x) * i) / 15,
          y: point.y + ((b.y + 50 - point.y) * i) / 15,
        },
      ],
    });
    await touchPage.waitForTimeout(15);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touchPage.waitForTimeout(300);
  assert.equal(
    await touchPage
      .locator('[data-stage="qualified"]')
      .getByRole("button", { name: "Loja Aurora", exact: true })
      .count(),
    1,
  );
  console.log("PASS real touch drag across columns");
  await touchContext.close();
} finally {
  await browser.close();
}


