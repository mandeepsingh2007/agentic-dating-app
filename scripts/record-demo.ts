// Records a real, end-to-end run of the site (no fixtures): pastes Ashneer Grover's links, waits for the
// live Apify scrape, analysis, dates and ranking, then tours the results. Writes demo/raw.webm + demo/marks.json.
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { chromium, type Locator, type Page } from "playwright";
import { db } from "../src/lib/supabase";

const BASE = process.env.DEMO_BASE ?? "http://localhost:3001";
const LI = "https://www.linkedin.com/in/ashneer/";
const IG = "https://www.instagram.com/ashneer.grover";
const W = 1280, H = 720;

const marks: { name: string; t: number }[] = [];
let t0 = 0;
const mark = (name: string) => { marks.push({ name, t: (Date.now() - t0) / 1000 }); console.log(name, marks.at(-1)!.t.toFixed(1)); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let mx = W / 2, my = H / 2;

async function moveTo(page: Page, x: number, y: number, steps = 30) {
  await page.mouse.move(x, y, { steps });
  mx = x; my = y;
}
async function moveToEl(page: Page, el: Locator) {
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  if (b) await moveTo(page, b.x + b.width / 2, b.y + b.height / 2);
}
async function click(page: Page, el: Locator) {
  await moveToEl(page, el);
  await sleep(250);
  await el.click();
}
/** Smooth wheel scroll of `px` over `ms` with the cursor at its current spot. */
async function scroll(page: Page, px: number, ms: number) {
  const steps = Math.max(1, Math.round(ms / 50));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await sleep(50);
  }
}
/** Keeps the frame moving (cursor drift + gentle scroll) until `done()` is true. */
async function liveWait(page: Page, done: () => Promise<boolean>, timeoutMs: number, area?: Locator) {
  const start = Date.now();
  let dir = 1;
  while (!(await done())) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting");
    const err = await page.locator("p.p-4.text-rose").first().textContent({ timeout: 200 }).catch(() => null);
    if (err) throw new Error("Pipeline error: " + err);
    const b = area ? await area.boundingBox({ timeout: 300 }).catch(() => null) : null;
    const x = b ? b.x + 40 + Math.random() * Math.max(10, b.width - 80) : 200 + Math.random() * 880;
    const y = b ? b.y + 20 + Math.random() * Math.max(10, Math.min(b.height, H - b.y) - 40) : 180 + Math.random() * 400;
    await moveTo(page, x, Math.min(H - 20, Math.max(20, y)), 40);
    await scroll(page, 60 * dir, 700);
    dir = -dir;
  }
}
const visible = (page: Page, text: string) => async () => (await page.getByText(text, { exact: false }).count().catch(() => 0)) > 0;

async function reset() {
  const { data } = await db().from("people").select("id").eq("ig_username", "ashneer.grover").eq("is_seed", false);
  for (const p of data ?? []) await db().from("people").delete().eq("id", p.id);
}

async function main() {
  await reset();
  rmSync("demo/video", { recursive: true, force: true });
  mkdirSync("demo/video", { recursive: true });

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: "demo/video", size: { width: W, height: H } } });
  await ctx.addInitScript(() => {
    const add = () => {
      if (document.getElementById("__cursor")) return;
      const c = document.createElement("div");
      c.id = "__cursor";
      Object.assign(c.style, {
        position: "fixed", left: "-50px", top: "-50px", width: "18px", height: "18px", borderRadius: "50%",
        background: "rgba(255,255,255,.9)", border: "2px solid #e8b04a", zIndex: "2147483647", pointerEvents: "none",
        transform: "translate(-50%,-50%)", transition: "transform .1s", boxShadow: "0 0 12px rgba(232,176,74,.6)",
      });
      document.body.appendChild(c);
      addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
      addEventListener("mousedown", () => { c.style.transform = "translate(-50%,-50%) scale(.6)"; }, true);
      addEventListener("mouseup", () => { c.style.transform = "translate(-50%,-50%)"; }, true);
    };
    if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  t0 = Date.now();
  const afterNav = async () => { await page.waitForLoadState("networkidle").catch(() => null); await moveTo(page, mx + 1, my + 1, 2); };

  // 1. Landing
  await page.goto(BASE);
  await afterNav();
  mark("intro");
  await moveTo(page, 300, 250, 30);
  await moveToEl(page, page.getByText("REAL PEOPLE", { exact: false }).first());
  await scroll(page, 380, 1800);
  await sleep(600);
  await scroll(page, -380, 1500);

  // 2. Paste links
  mark("fill");
  const li = page.getByPlaceholder("https://www.linkedin.com/in/your-name");
  const ig = page.getByPlaceholder("https://www.instagram.com/yourname");
  await click(page, li);
  await li.pressSequentially(LI, { delay: 45 });
  await click(page, ig);
  await ig.pressSequentially(IG, { delay: 45 });
  await click(page, page.getByRole("button", { name: "A man" }));
  await click(page, page.getByRole("button", { name: "Women", exact: true }));
  await sleep(300);
  await click(page, page.getByRole("button", { name: /Create my agent/ }));

  // 3. Live scrape
  await page.waitForURL(/\/join\//, { timeout: 60_000 });
  await afterNav();
  mark("scrape");
  await liveWait(page, visible(page, "The Analyst agent is reading"), 240_000);

  // 4. Analyst reading
  mark("analyze");
  const panel = page.locator("div.rise", { hasText: "The Analyst agent is reading" }).first();
  await moveToEl(page, panel);
  const datesStarted = async () => (await visible(page, "dates finished")()) || (await visible(page, "Your top matches")());
  await liveWait(page, datesStarted, 300_000, panel);

  // 5. Dates
  mark("dates");
  const doneRanking = visible(page, "Your top matches");
  const startDates = Date.now();
  while (!(await doneRanking())) {
    if (Date.now() - startDates > 420_000) throw new Error("Timed out waiting for dates");
    const live = page.getByText("Live date", { exact: false }).first();
    if (await live.isVisible().catch(() => false)) {
      await live.evaluate((el) => el.closest("div.rise")?.scrollIntoView({ behavior: "smooth", block: "center" }), null, { timeout: 1500 }).catch(() => null);
      const box = await live.evaluate((el) => { const r = el.closest("div.rise")!.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, null, { timeout: 1500 }).catch(() => null);
      if (box) await moveTo(page, box.x + 80 + Math.random() * (box.w - 160), box.y + 40 + Math.random() * Math.max(20, box.h - 80), 35);
    } else {
      await moveTo(page, 300 + Math.random() * 680, 250 + Math.random() * 300, 35);
    }
    await sleep(400);
  }

  // 6. Top matches
  mark("ranked");
  const top = page.getByRole("heading", { name: "Your top matches" });
  await moveToEl(page, top);
  await scroll(page, 300, 1500);
  await sleep(2500);
  await click(page, page.getByRole("link", { name: /See your full profile/ }));

  // 7. Profile page
  await page.waitForURL(/\/people\//);
  await afterNav();
  mark("profile");
  await moveTo(page, 640, 300, 25);
  await sleep(1500);
  await scroll(page, 520, 3500);
  await sleep(800);
  await scroll(page, 520, 3000);
  const chip = page.locator("button", { hasText: "%" }).nth(3);
  await click(page, chip).catch((e) => console.log("chip skipped", (e as Error).message.slice(0, 80)));
  await sleep(3500);
  await scroll(page, 600, 3500);
  await sleep(600);
  await scroll(page, 700, 3500);
  await scroll(page, -2600, 2500);

  // 8. Their best date
  mark("date");
  const first = page.locator("a[href^='/dates/']").first();
  await click(page, first);
  await page.waitForURL(/\/dates\//);
  await afterNav();
  await moveTo(page, 640, 400, 20);
  await sleep(1200);
  for (let i = 0; i < 7; i++) { await scroll(page, 330, 2200); await sleep(400); }

  // 9. Date night
  mark("datenight");
  await click(page, page.getByRole("link", { name: "Date Night", exact: true }));
  await page.waitForURL(/date-night/);
  await afterNav();
  await moveTo(page, 640, 360, 20);
  await sleep(1000);
  await scroll(page, 700, 4000);
  await scroll(page, -300, 2000);

  // 10. Rankings
  mark("rankings");
  await click(page, page.getByRole("link", { name: "Rankings", exact: true }));
  await page.waitForURL(/rankings/);
  await afterNav();
  await moveTo(page, 640, 360, 20);
  await sleep(1200);
  for (let i = 0; i < 5; i++) { await scroll(page, 420, 2200); await sleep(400); }

  // 11. How it works
  mark("how");
  await click(page, page.getByRole("link", { name: "How it works", exact: true }));
  await page.waitForURL(/how-it-works/);
  await afterNav();
  await moveTo(page, 640, 360, 20);
  for (let i = 0; i < 5; i++) { await scroll(page, 400, 2200); await sleep(300); }

  // 12. Back to the pool
  mark("outro");
  await click(page, page.getByRole("link", { name: "People", exact: true }));
  await page.waitForURL(/\/people$/);
  await afterNav();
  await moveTo(page, 640, 360, 20);
  for (let i = 0; i < 6; i++) { await scroll(page, 350, 2200); await sleep(300); }
  mark("end");

  const personId = page.url();
  await ctx.close();
  await browser.close();
  const file = readdirSync("demo/video").find((f) => f.endsWith(".webm"))!;
  renameSync(`demo/video/${file}`, "demo/raw.webm");
  writeFileSync("demo/marks.json", JSON.stringify({ marks, lastUrl: personId }, null, 2));
  console.log("saved demo/raw.webm");
}

main().catch((e) => { console.error(e); process.exit(1); });
