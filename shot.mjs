import { chromium } from "playwright";
const b = await chromium.launch();
for (const [mode,w,h,name] of [["light",1280,1500,"light"],["dark",1280,1500,"dark"],["light",390,1400,"mobile"]]) {
  const ctx = await b.newContext({ colorScheme: mode, viewport:{width:w,height:h}, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto("file:///Users/riiid/unjeong-ipark/index.html");
  await p.waitForTimeout(600);
  await p.screenshot({ path: `/tmp/shot-${name}.png` });
  const err = await p.evaluate(()=>document.querySelector('#count')?.textContent);
  console.log(name, "→", err);
  await ctx.close();
}
await b.close();
