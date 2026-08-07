// 운정신도시아이파크 34평 매물 페이지 빌더
// 사용법: node build.mjs   → index.html 생성
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = process.env.MCP_REALESTATE || "/Users/riiid/mcp-realestate/index.js";
const COMPLEX = { no: "119854", name: "운정신도시아이파크", station: "GTX-A 운정중앙역", distance: 561 };

const DIR = { ES: "동남", WS: "남서", SS: "남", SE: "남동", EE: "동", WW: "서", NN: "북", NE: "북동", NW: "북서", SW: "남서" };

function parse(text, trade) {
  const out = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    if (!line.includes("fin.land.naver.com/articles/")) continue;
    const parts = line.split(" | ").map((s) => s.trim());
    const url = parts[parts.length - 1];
    const id = url.split("/").pop();
    if (seen.has(id)) continue;
    seen.add(id);

    const price = parseFloat(parts[0]);
    const dm = parts[1].match(/(\d+)동\s+(.+)층/);
    const am = parts[2].match(/전용\s+([\d.]+)㎡\((\w+)\)/);
    const memo = parts.slice(7, parts.length - 1).join(" | ");
    const flat = memo.replace(/\s/g, "");

    const roomM = memo.replace(/개/g, "").match(/방\s?(\d)/);
    const acM = flat.match(/에어컨(\d)|시에(\d)|에(\d)(?!\d)/);
    const opts = [];
    if (acM) opts.push("에어컨" + (acM[1] || acM[2] || acM[3]));
    else if (flat.includes("풀에어컨")) opts.push("풀에어컨");
    for (const [k, v] of [["중문", "중문"], ["팬트리", "팬트리"], ["펜트리", "팬트리"], ["식세기", "식세기"],
      ["식기세척", "식세기"], ["인덕션", "인덕션"], ["올인테리어", "올수리"], ["리모델링", "리모델링"], ["판상형", "판상형"]]) {
      if (flat.includes(k) && !opts.includes(v)) opts.push(v);
    }

    let cond = "";
    if (flat.includes("월세안고")) cond = "월세안고";
    else if (flat.includes("세안고")) cond = "전세안고";
    else if (flat.includes("즉시입주") || flat.includes("빠른입주")) cond = "즉시입주";
    else if (/입주협의|입주조율|입주가능|입주가|입주ok/i.test(flat)) cond = "입주협의";
    else if (flat.includes("주인거주")) cond = "주인거주";

    const floorRaw = dm ? dm[2] : "";
    const fnum = parseInt(floorRaw.split("/")[0], 10);

    out.push({
      trade, price, dong: dm ? +dm[1] : 0,
      floor: floorRaw,
      floorSort: Number.isFinite(fnum) ? fnum : ({ 저: 3, 중: 12, 고: 22 }[floorRaw[0]] ?? 0),
      area: am ? +am[1] : 0, type: am ? am[2] : "",
      dir: DIR[parts[3]] || parts[3],
      verify: parts[4] || "", fee: parts[5] || "",
      broker: (parts[6] || "").replace(/공인중개사사무소/g, "").replace(/부동산/g, "").trim(),
      room: roomM ? +roomM[1] : null,
      cond, opts, memo, url,
    });
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(items, counts, stamp) {
  const sale = items.filter((i) => i.trade === "매매");
  const prices = sale.map((i) => i.price).sort((a, b) => a - b);
  const med = prices[Math.floor(prices.length / 2)];
  const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "") + "억";

  // 0.2억 구간 히스토그램 (단일 계열 → 시퀀셜 1색, 범례 불필요)
  const lo = Math.floor(prices[0] * 5) / 5, hi = Math.ceil(prices[prices.length - 1] * 5) / 5;
  const bins = [];
  for (let x = lo; x < hi - 1e-9; x = +(x + 0.2).toFixed(2)) {
    const to = +(x + 0.2).toFixed(2);
    const last = to >= hi - 1e-9;
    // 마지막 구간은 상한 포함 — 아니면 최고가 매물이 어느 막대에도 안 잡힌다
    const n = prices.filter((p) => p >= x - 1e-9 && (last ? p <= to + 1e-9 : p < to - 1e-9)).length;
    bins.push({ from: x, to, n });
  }
  const binSum = bins.reduce((a, b) => a + b.n, 0);
  if (binSum !== prices.length) throw new Error(`히스토그램 합 ${binSum} ≠ 매물 ${prices.length}`);
  const maxN = Math.max(...bins.map((b) => b.n), 1);

  const BW = 44, GAP = 6, CH = 150, PADB = 26;
  const chartW = bins.length * (BW + GAP) - GAP;
  const barsSvg = bins.map((b, i) => {
    const h = b.n === 0 ? 0 : Math.max(4, Math.round((b.n / maxN) * (CH - PADB - 14)));
    const x = i * (BW + GAP), y = CH - PADB - h;
    return `<g class="bin" tabindex="0" data-label="${b.from}~${b.to}억" data-n="${b.n}">
      <rect class="hit" x="${x}" y="0" width="${BW}" height="${CH}"></rect>
      ${b.n ? `<rect class="bar" x="${x}" y="${y}" width="${BW}" height="${h}" rx="4"></rect>` : ""}
      ${b.n ? `<text class="barval" x="${x + BW / 2}" y="${y - 5}">${b.n}</text>` : ""}
      <text class="tick" x="${x + BW / 2}" y="${CH - 8}">${b.from.toFixed(1)}</text>
    </g>`;
  }).join("");

  const rows = items.map((i) => `{p:${i.price},t:"${i.trade}",d:${i.dong},f:"${esc(i.floor)}",fs:${i.floorSort},a:${i.area},y:"${i.type}",dir:"${i.dir}",v:"${esc(i.verify)}",fee:"${esc(i.fee)}",b:"${esc(i.broker)}",r:${i.room ?? "null"},c:"${i.cond}",o:${JSON.stringify(i.opts)},m:"${esc(i.memo).replace(/"/g, "&quot;")}",u:"${i.url}"}`).join(",\n");

  return `<!doctype html>
<html lang="ko" data-theme="">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>운정신도시아이파크 34평 매물</title>
<meta name="description" content="GTX 운정중앙역 운정신도시아이파크 전용 84㎡ 매물 현황">
<style>
  :root{
    color-scheme:light;
    --surface-1:#fcfcfb; --plane:#f9f9f7;
    --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
    --grid:#e1e0d9; --axis:#c3c2b7; --ring:rgba(11,11,11,.10);
    --series-1:#2a78d6; --chip:#f0efec;
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      color-scheme:dark;
      --surface-1:#1a1a19; --plane:#0d0d0d;
      --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
      --grid:#2c2c2a; --axis:#383835; --ring:rgba(255,255,255,.10);
      --series-1:#3987e5; --chip:#242423;
    }
  }
  :root[data-theme="dark"]{
    color-scheme:dark;
    --surface-1:#1a1a19; --plane:#0d0d0d;
    --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --ring:rgba(255,255,255,.10);
    --series-1:#3987e5; --chip:#242423;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--plane);color:var(--ink);
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.5}
  .wrap{max-width:1180px;margin:0 auto;padding:20px 16px 64px}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:6px}
  h1{font-size:21px;margin:0 0 4px;letter-spacing:-.01em}
  .sub{color:var(--ink-2);font-size:13px;margin:0}
  .sub a{color:var(--series-1)}
  .themebtn{background:var(--surface-1);border:1px solid var(--ring);color:var(--ink-2);
    border-radius:8px;padding:7px 11px;font-size:13px;cursor:pointer;font-family:inherit}
  .card{background:var(--surface-1);border:1px solid var(--ring);border-radius:12px;padding:16px;margin-top:16px}
  .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--ring);
    border:1px solid var(--ring);border-radius:12px;overflow:hidden;margin-top:16px}
  .kpi>div{background:var(--surface-1);padding:14px 16px}
  .kpi .k{font-size:12px;color:var(--muted);margin-bottom:5px}
  .kpi .v{font-size:26px;font-weight:600;letter-spacing:-.02em}
  .kpi .n{font-size:12px;color:var(--ink-2);margin-top:2px}
  h2{font-size:14px;margin:0 0 2px;font-weight:600}
  .cap{font-size:12px;color:var(--muted);margin:0 0 12px}
  .chartbox{overflow-x:auto;position:relative}
  svg{display:block}
  .bar{fill:var(--series-1)}
  .hit{fill:transparent}
  .bin{cursor:default;outline:none}
  .bin:hover .bar,.bin:focus-visible .bar{opacity:.75}
  .bin:focus-visible .hit{stroke:var(--series-1);stroke-width:2}
  .tick{fill:var(--muted);font-size:11px;text-anchor:middle}
  .barval{fill:var(--ink-2);font-size:11px;text-anchor:middle;font-variant-numeric:tabular-nums}
  #tip{position:fixed;pointer-events:none;opacity:0;transition:opacity .1s;background:var(--surface-1);
    border:1px solid var(--ring);border-radius:8px;padding:7px 10px;font-size:12px;
    box-shadow:0 4px 16px rgba(0,0,0,.16);z-index:9;white-space:nowrap}
  .filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:16px}
  select,input[type=search]{background:var(--surface-1);color:var(--ink);border:1px solid var(--ring);
    border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit}
  input[type=search]{flex:1;min-width:150px}
  .count{font-size:13px;color:var(--ink-2);margin:14px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:left;font-weight:600;font-size:12px;color:var(--muted);padding:8px 10px;
    border-bottom:1px solid var(--axis);white-space:nowrap;cursor:pointer;user-select:none}
  th[data-s]:hover{color:var(--ink)}
  th .ar{opacity:.4;font-size:10px}
  td{padding:9px 10px;border-bottom:1px solid var(--grid);vertical-align:top}
  tbody tr:hover{background:var(--chip)}
  .price{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
  .price a{color:var(--series-1);text-decoration:none}
  .price a:hover{text-decoration:underline}
  .num{font-variant-numeric:tabular-nums;white-space:nowrap}
  .chip{display:inline-block;background:var(--chip);color:var(--ink-2);border-radius:5px;
    padding:1px 6px;font-size:11.5px;margin:1px 3px 1px 0;white-space:nowrap}
  .memo{color:var(--muted);font-size:12px;max-width:320px}
  .mobile{display:none}
  footer{margin-top:28px;font-size:12px;color:var(--muted);line-height:1.7}
  @media (max-width:820px){
    .kpi{grid-template-columns:repeat(2,1fr)}
    table{display:none}
    .mobile{display:block}
    .item{background:var(--surface-1);border:1px solid var(--ring);border-radius:10px;padding:12px;margin-bottom:8px}
    .item .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
    .item .top .price{font-size:19px}
    .item .meta{color:var(--ink-2);font-size:13px;margin-top:3px}
  }
</style>
</head>
<body>
<div class="wrap">
<header>
  <div>
    <h1>운정신도시아이파크 · 34평 매물</h1>
    <p class="sub">전용 84㎡ · ${COMPLEX.station} 직선 ${COMPLEX.distance}m ·
      <a href="https://fin.land.naver.com/complexes/${COMPLEX.no}" target="_blank" rel="noopener">네이버 부동산 단지</a></p>
    <p class="sub">갱신 ${stamp} · 출처 네이버페이 부동산</p>
  </div>
  <button class="themebtn" id="tb">테마</button>
</header>

<div class="kpi">
  <div><div class="k">매매 매물</div><div class="v">${sale.length}<span style="font-size:15px">건</span></div><div class="n">단지 전체 ${counts.deal}건 중 34평</div></div>
  <div><div class="k">최저 호가</div><div class="v">${fmt(prices[0])}</div><div class="n">${sale.find((s) => s.price === prices[0]).dong}동</div></div>
  <div><div class="k">중앙 호가</div><div class="v">${fmt(med)}</div><div class="n">34평 매매 기준</div></div>
  <div><div class="k">최고 호가</div><div class="v">${fmt(prices[prices.length - 1])}</div><div class="n">최저 대비 +${fmt(prices[prices.length - 1] - prices[0])}</div></div>
</div>

<div class="card">
  <h2>호가 분포</h2>
  <p class="cap">0.2억 구간별 매매 매물 수 · 총 ${sale.length}건</p>
  <div class="chartbox">
    <svg width="${chartW}" height="${CH}" viewBox="0 0 ${chartW} ${CH}" role="img"
         aria-label="호가 구간별 매물 수 분포. 아래 표에 전체 매물이 있습니다.">
      <line x1="0" y1="${CH - PADB}" x2="${chartW}" y2="${CH - PADB}" stroke="var(--axis)" stroke-width="1"/>
      ${barsSvg}
    </svg>
  </div>
</div>

<div class="filters">
  <select id="f-trade"><option value="">거래 전체</option><option value="매매" selected>매매</option><option value="전세">전세</option></select>
  <select id="f-type"><option value="">타입 전체</option></select>
  <select id="f-dong"><option value="">동 전체</option></select>
  <select id="f-dir"><option value="">향 전체</option></select>
  <select id="f-room"><option value="">방 전체</option><option value="3">방3</option><option value="4">방4</option></select>
  <select id="f-cond"><option value="">조건 전체</option></select>
  <input type="search" id="f-q" placeholder="중개사·설명 검색">
</div>

<p class="count" id="count"></p>
<table>
  <thead><tr>
    <th data-s="p">호가 <span class="ar">▲</span></th>
    <th data-s="d">동</th><th data-s="fs">층</th><th data-s="y">타입</th>
    <th data-s="dir">향</th><th data-s="r">방</th><th>조건</th><th>옵션</th>
    <th data-s="b">중개사</th><th>설명</th>
  </tr></thead>
  <tbody id="tb-body"></tbody>
</table>
<div class="mobile" id="mob"></div>

<footer>
  호가는 매도 희망가이며 실거래가가 아닙니다. 같은 집이 여러 중개사에 중복 등록될 수 있어 실제 물건 수는 표기보다 적습니다.<br>
  방·조건·옵션은 중개사 매물 설명에서 자동 추출한 값이라, 빈칸은 정보 미기재이지 없다는 뜻이 아닙니다.
</footer>
</div>
<div id="tip" role="status"></div>

<script>
const DATA=[
${rows}
];
const $=s=>document.querySelector(s);
const fmt=n=>(Math.round(n*100)/100).toFixed(2).replace(/\\.?0+$/,'')+'억';
const uniq=(k,f)=>[...new Set(DATA.filter(f||(()=>1)).map(x=>x[k]).filter(v=>v!==''&&v!=null))];

for(const [sel,key,lab] of [['#f-type','y',v=>v],['#f-dong','d',v=>v+'동'],['#f-dir','dir',v=>v+'향'],['#f-cond','c',v=>v]]){
  uniq(key).sort((a,b)=>typeof a==='number'?a-b:String(a).localeCompare(b))
    .forEach(v=>$(sel).insertAdjacentHTML('beforeend','<option value="'+v+'">'+lab(v)+'</option>'));
}

let sortKey='p', sortAsc=true;
function current(){
  const t=$('#f-trade').value,ty=$('#f-type').value,dg=$('#f-dong').value,
        dr=$('#f-dir').value,rm=$('#f-room').value,cd=$('#f-cond').value,
        q=$('#f-q').value.trim().toLowerCase();
  return DATA.filter(x=>
    (!t||x.t===t)&&(!ty||x.y===ty)&&(!dg||x.d==dg)&&(!dr||x.dir===dr)&&
    (!rm||x.r==rm)&&(!cd||x.c===cd)&&
    (!q||(x.b+' '+x.m).toLowerCase().includes(q))
  ).sort((a,b)=>{
    const A=a[sortKey],B=b[sortKey];
    const c=typeof A==='number'&&typeof B==='number'?A-B:String(A).localeCompare(String(B),'ko');
    return sortAsc?c:-c;
  });
}
function chips(x){
  let h='';
  if(x.c)h+='<span class="chip">'+x.c+'</span>';
  return h;
}
function draw(){
  const rows=current();
  $('#count').textContent=rows.length+'건 표시 중 (전체 '+DATA.length+'건)';
  $('#tb-body').innerHTML=rows.map(x=>
    '<tr><td class="price"><a href="'+x.u+'" target="_blank" rel="noopener">'+fmt(x.p)+'</a></td>'+
    '<td class="num">'+x.d+'동</td><td class="num">'+x.f+'</td><td>'+x.y+'</td>'+
    '<td>'+x.dir+'</td><td class="num">'+(x.r?'방'+x.r:'—')+'</td>'+
    '<td>'+(x.c?'<span class="chip">'+x.c+'</span>':'—')+'</td>'+
    '<td>'+(x.o.length?x.o.map(o=>'<span class="chip">'+o+'</span>').join(''):'—')+'</td>'+
    '<td>'+x.b+'</td><td class="memo">'+x.m+'</td></tr>').join('');
  $('#mob').innerHTML=rows.map(x=>
    '<div class="item"><div class="top"><span class="price"><a href="'+x.u+'" target="_blank" rel="noopener">'+fmt(x.p)+'</a></span>'+
    '<span class="num">'+x.d+'동 '+x.f+'층</span></div>'+
    '<div class="meta">'+x.y+' · '+x.dir+'향'+(x.r?' · 방'+x.r:'')+' · '+x.b+'</div>'+
    '<div>'+chips(x)+x.o.map(o=>'<span class="chip">'+o+'</span>').join('')+'</div>'+
    (x.m?'<div class="memo">'+x.m+'</div>':'')+'</div>').join('');
}
document.querySelectorAll('th[data-s]').forEach(th=>th.addEventListener('click',()=>{
  const k=th.dataset.s;
  if(sortKey===k)sortAsc=!sortAsc; else {sortKey=k;sortAsc=true;}
  document.querySelectorAll('th .ar').forEach(a=>a.remove());
  th.insertAdjacentHTML('beforeend',' <span class="ar">'+(sortAsc?'▲':'▼')+'</span>');
  draw();
}));
document.querySelectorAll('.filters select,.filters input').forEach(e=>e.addEventListener('input',draw));

const tip=$('#tip');
function showTip(g,ev){
  tip.innerHTML='<b>'+g.dataset.label+'</b> · '+g.dataset.n+'건';
  const r=g.getBoundingClientRect();
  const x=ev?ev.clientX:r.left+r.width/2, y=ev?ev.clientY:r.top;
  tip.style.opacity=1;
  tip.style.left=Math.min(x+12,innerWidth-tip.offsetWidth-8)+'px';
  tip.style.top=(y-tip.offsetHeight-10)+'px';
}
document.querySelectorAll('.bin').forEach(g=>{
  g.addEventListener('mousemove',e=>showTip(g,e));
  g.addEventListener('mouseleave',()=>tip.style.opacity=0);
  g.addEventListener('focus',()=>showTip(g,null));
  g.addEventListener('blur',()=>tip.style.opacity=0);
});

const root=document.documentElement;
root.dataset.theme=localStorage.getItem('theme')||'';
$('#tb').addEventListener('click',()=>{
  const cur=root.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
  root.dataset.theme=cur==='dark'?'light':'dark';
  localStorage.setItem('theme',root.dataset.theme);
});
draw();
</script>
</body>
</html>`;
}

// ── main ──
const c = new Client({ name: "build", version: "1" }, { capabilities: {} });
await c.connect(new StdioClientTransport({ command: "node", args: [MCP_SERVER] }));

const texts = {};
for (const tt of ["매매", "전세"]) {
  const r = await c.callTool({
    name: "get_naver_listings",
    arguments: { complexNumber: COMPLEX.no, tradeType: tt, minArea: 80, maxArea: 90, limit: 300 },
  });
  texts[tt] = r.content[0].text;
}

const items = [...parse(texts["매매"], "매매"), ...parse(texts["전세"], "전세")];
if (items.length === 0) { console.error("매물 0건 — 수집 실패. 배포 중단."); process.exit(1); }

const cm = texts["매매"].match(/매매 (\d+) \/ 전세 (\d+) \/ 월세 (\d+)/);
const counts = { deal: cm ? +cm[1] : 0, lease: cm ? +cm[2] : 0, monthly: cm ? +cm[3] : 0 };

const stamp = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short",
}).format(new Date());

fs.writeFileSync(path.join(__dirname, "index.html"), render(items, counts, stamp));
fs.writeFileSync(path.join(__dirname, "data.json"), JSON.stringify({ stamp, counts, items }, null, 1));
console.log(`✓ index.html 생성 — 매매 ${items.filter((i) => i.trade === "매매").length}건 / 전세 ${items.filter((i) => i.trade === "전세").length}건 (${stamp})`);
process.exit(0);
