// 라이트/다크/모바일 렌더링 검수용 스크린샷 → /tmp/shot-*.png
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || pathToFileURL(path.join(__dirname, "index.html")).href;

const b = await chromium.launch();
for (const [mode, w, h, name] of [["light", 1280, 1500, "light"], ["dark", 1280, 1500, "dark"], ["light", 390, 1400, "mobile"]]) {
  const ctx = await b.newContext({ colorScheme: mode, viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(target, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `/tmp/shot-${name}.png` });
  console.log(name.padEnd(7), await p.evaluate(() => document.querySelector("#count")?.textContent), errs.length ? `| 에러: ${errs}` : "");
  await ctx.close();
}
await b.close();
