import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.QA_BASE_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch();
const pages = [];
const errors = [];

async function pageAt(context, path) {
  const page = await context.newPage();
  pages.push(page);
  page.on("pageerror", error => errors.push(`${path}: ${error.message}`));
  const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, `GET ${path}`);
  return page;
}

async function waitFor(page, expression) {
  await page.waitForFunction(expression, undefined, { timeout: 15000 });
}

try {
  const soloContext = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const solo = await pageAt(soloContext, "/");
  // No home screen: / opens straight into the Solo game.
  assert.equal(await solo.locator("#homeLobby").count(), 0, "Solo has no home screen");
  assert.equal(await solo.locator("#c").count(), 1, "Solo renders one canvas");
  assert.ok(await solo.locator("canvas:visible").count() > 0, "Solo rendering canvas is visible");
  const soloOverflow = await solo.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(soloOverflow <= 1, `Solo has ${soloOverflow}px horizontal overflow at 320px`);

  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await pageAt(hostContext, "/multiplayer");
  await host.locator("#playerName").fill("QA Host");
  await host.locator("#create").click();
  await waitFor(host, () => /^[A-Z2-9]{6}$/.test(document.querySelector("#roomCode")?.textContent || ""));
  const code = (await host.locator("#roomCode").textContent()).trim();
  assert.equal(await host.locator("#currentName").textContent(), "QA Host");

  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guest = await pageAt(guestContext, `/multiplayer/${code}`);
  await guest.locator("#inviteDetails").waitFor({ state: "visible" });
  assert.equal(await guest.locator("#playerName").inputValue(), "", "New invitee must provide a name");
  await guest.locator("#playerName").fill("QA Guest");
  await guest.locator("#acceptInvite").click();
  await waitFor(guest, () => document.querySelector("#currentName")?.textContent === "QA Guest");
  await waitFor(host, () => document.querySelector("#playerCount")?.textContent?.includes("2 PADDLES"));
  await waitFor(guest, () => document.querySelector("#playerCount")?.textContent?.includes("2 PADDLES"));
  await host.locator("#start").click();
  await waitFor(host, () => document.querySelector("#statusText")?.textContent === "LIVE MATCH");
  await waitFor(guest, () => document.querySelector("#statusText")?.textContent === "LIVE MATCH");
  assert.equal(await host.locator("#slot0.me").count(), 1, "Host views their paddle at bottom");
  assert.equal(await guest.locator("#slot0.me").count(), 1, "Guest views their paddle at bottom");
  assert.equal(await host.locator("#c").count(), 1, "Host has one shared board");
  assert.equal(await guest.locator("#c").count(), 1, "Guest has one shared board");
  await host.locator("canvas:visible").first().click({ position: { x: 30, y: 100 } });
  await guest.locator("canvas:visible").first().click({ position: { x: 30, y: 100 } });
  await host.keyboard.press("ArrowRight");
  await guest.keyboard.press("ArrowLeft");
  assert.deepEqual(errors, [], "Browser console has no uncaught page errors");
  console.log("Browser smoke passed: Solo, mobile layout, invite, 2-player round, own POV, paddle inputs");
} catch (error) {
  await mkdir("qa-artifacts", { recursive: true });
  await Promise.all(pages.map((page, index) => page.screenshot({ path: `qa-artifacts/page-${index}.png`, fullPage: true }).catch(() => {})));
  if (errors.length) console.error("Page errors:\n" + errors.join("\n"));
  throw error;
} finally {
  await browser.close();
}
