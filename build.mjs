// 운정신도시아이파크 34평 매물 페이지 빌더
// 사용법: node build.mjs   → index.html 생성
// MCP SDK는 실제 수집할 때만 불러온다(오프라인 재생성은 SDK 없이 동작하도록)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MCP 서버 위치: 환경변수 → 이 폴더 옆 → 홈 순으로 찾는다 (맥이 바뀌어도 동작하도록)
const CANDIDATES = [
  process.env.MCP_REALESTATE,
  path.join(__dirname, "..", "mcp-realestate", "index.js"),
  path.join(os.homedir(), "mcp-realestate", "index.js"),
].filter(Boolean);
const MCP_SERVER = CANDIDATES.find((p) => fs.existsSync(p));
const OFFLINE = process.argv.includes("--offline");
if (MCP_SERVER) console.log("MCP 서버:", MCP_SERVER);
if (!MCP_SERVER && !OFFLINE) {
  console.error("mcp-realestate 서버를 찾지 못했습니다. 찾아본 경로:\n  " + CANDIDATES.join("\n  ") +
    "\n\n해결: MCP_REALESTATE=/경로/index.js node build.mjs" +
    "\n또는 수집 없이 캐시로 페이지만 다시 만들기: node build.mjs --offline");
  process.exit(1);
}
const COMPLEX = { no: "119854", name: "운정신도시아이파크", station: "GTX-A 운정중앙역", distance: 561 };

const DIR = { ES: "동남", WS: "남서", SS: "남", SE: "남동", EE: "동", WW: "서", NN: "북", NE: "북동", NW: "북서", SW: "남서" };

function parse(text, trade) {
  const out = [];
  const seen = new Set();
  const cleanB = (s) => String(s).replace(/공인중개사사무소/g, "").replace(/부동산$/g, "").replace(/부동산/g, "").trim();
  for (const line of text.split("\n")) {
    if (!line.includes("fin.land.naver.com/articles/")) continue;
    const parts = line.split(" | ").map((s) => s.trim());
    // 공동중개(같은 집 보유 중개사 목록) 칸을 통째로 떼어낸다 — URL 등 다른 칸이 안 깨지도록
    let brokers = [];
    const bi = parts.findIndex((p) => p.startsWith("보유중개사»"));
    if (bi >= 0) {
      brokers = parts[bi].replace("보유중개사»", "").split(" ; ").map((s) => cleanB(s)).filter(Boolean);
      parts.splice(bi, 1);
    }
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
      broker: cleanB(parts[6] || ""),
      brokers,
      room: roomM ? +roomM[1] : null,
      cond, opts, memo, url,
    });
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(items, counts, stamp) {
  // KPI·분포는 클라이언트에서 현재 필터 기준으로 다시 계산한다 (표와 숫자가 어긋나지 않도록)
  const rows = items.map((i) => `{p:${i.price},t:"${i.trade}",d:${i.dong},f:"${esc(i.floor)}",fs:${i.floorSort},a:${i.area},y:"${i.type}",dir:"${i.dir}",v:"${esc(i.verify)}",fee:"${esc(i.fee)}",b:"${esc(i.broker)}",br:[${(i.brokers || []).map((b) => `"${esc(b).replace(/"/g, "&quot;")}"`).join(",")}],r:${i.room ?? "null"},c:"${i.cond}",o:${JSON.stringify(i.opts)},m:"${esc(i.memo).replace(/"/g, "&quot;")}",u:"${i.url}"}`).join(",\n");

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
  .ms{position:relative}
  .ms-btn{background:var(--surface-1);color:var(--ink);border:1px solid var(--ring);border-radius:8px;
    padding:8px 10px;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap}
  .ms-btn:hover{border-color:var(--series-1)}
  .ms-btn[aria-expanded=true]{border-color:var(--series-1)}
  .ms-panel{position:absolute;z-index:10;top:calc(100% + 4px);left:0;background:var(--surface-1);
    border:1px solid var(--ring);border-radius:10px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.18);
    display:grid;grid-template-columns:repeat(2,minmax(118px,1fr));gap:1px;
    min-width:246px;max-height:300px;overflow:auto}
  .ms-panel[hidden]{display:none}
  .ms-opt{display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:7px;
    font-size:13px;color:var(--ink-2);cursor:pointer;user-select:none;white-space:nowrap}
  .ms-opt input{flex:none}
  .ms-opt:hover{background:var(--chip)}
  .ms-opt input{accent-color:var(--series-1);margin:0;width:15px;height:15px}
  .ms-opt .cnt{margin-left:auto;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
  .ms-opt.ms-all{grid-column:1/-1;border-bottom:1px solid var(--grid);margin-bottom:3px;
    padding-bottom:8px;font-weight:600;color:var(--ink)}
  .ms-panel .linkbtn{grid-column:1/-1;text-align:left;padding:6px 9px}
  .cobadge{display:inline-block;background:var(--series-1);color:#fff;border-radius:5px;
    padding:1px 6px;font-size:11px;font-weight:600;margin-right:5px;white-space:nowrap}
  .brokers{color:var(--ink-2);font-size:12.5px;line-height:1.5}
  .brokers .rep{color:var(--ink);font-weight:600}
  .star{background:none;border:0;cursor:pointer;padding:0 3px;font-size:21px;line-height:1;
    color:var(--axis);font-family:inherit;vertical-align:middle}
  .star:hover{color:#f0b400}
  .rankbadge{border:0;cursor:pointer;width:25px;height:25px;border-radius:50%;color:#fff;
    font-size:13px;font-weight:800;font-family:inherit;font-variant-numeric:tabular-nums;
    display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;
    box-shadow:0 1px 3px rgba(0,0,0,.22)}
  .rankbadge:hover{filter:brightness(1.08)}
  .starcol{width:52px;cursor:pointer}
  th.starcol{font-size:11px;color:var(--muted);text-align:center}
  td.starcell{padding:6px 0 6px 6px;text-align:center;white-space:nowrap}
  .grip{display:none;color:var(--muted);cursor:grab;font-size:13px;margin-right:1px;vertical-align:middle}
  #tb-body tr[draggable] .grip{display:inline}
  #tb-body tr[draggable]{cursor:grab}
  #tb-body tr.dragover td{border-top:2px solid var(--series-1)}
  #tb-body tr.dragging{opacity:.4}
  .listtop{display:flex;align-items:center;gap:12px;margin:16px 0 8px;flex-wrap:wrap}
  .listtop .count{margin:0}
  .favbtn{background:var(--surface-1);border:1px solid var(--ring);color:var(--ink-2);
    border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer;font-family:inherit;white-space:nowrap}
  .favbtn:hover{border-color:#f0b400}
  .favbtn.on{border-color:#f0b400;color:var(--ink);background:rgba(240,180,0,.10)}
  .syncdot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--muted);margin-right:6px;vertical-align:1px}
  .syncdot.on{background:#2fb344}
  .syncdot.err{background:#e0554f}
  #sync-status{font-size:12px;color:var(--muted)}
  .chkrow{border:0;padding:0;margin:12px 0 0;display:flex;flex-wrap:wrap;gap:7px;align-items:center}
  .chkrow legend{float:left;font-size:12px;color:var(--muted);padding:0 8px 0 2px;line-height:34px}
  .chkrow #f-cond{display:contents}
  .chk{display:inline-flex;align-items:center;gap:6px;background:var(--surface-1);
    border:1px solid var(--ring);border-radius:999px;padding:7px 13px 7px 10px;
    font-size:13px;color:var(--ink-2);cursor:pointer;user-select:none}
  .chk:has(input:checked){border-color:var(--series-1);color:var(--ink)}
  .chk:has(input:focus-visible){outline:2px solid var(--series-1);outline-offset:2px}
  .chk input{accent-color:var(--series-1);margin:0;width:15px;height:15px}
  .chk .cnt{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px}
  .linkbtn{background:none;border:0;color:var(--series-1);font-size:12.5px;
    cursor:pointer;font-family:inherit;padding:4px 2px;text-decoration:underline}
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
  <div><div class="k" id="k0">매물</div><div class="v" id="v0">–</div><div class="n" id="n0">단지 전체 ${counts.deal}건 중 34평</div></div>
  <div><div class="k">최저 호가</div><div class="v" id="v1">–</div><div class="n" id="n1"></div></div>
  <div><div class="k">중앙 호가</div><div class="v" id="v2">–</div><div class="n" id="n2"></div></div>
  <div><div class="k">최고 호가</div><div class="v" id="v3">–</div><div class="n" id="n3"></div></div>
</div>

<div class="card">
  <h2>호가 분포</h2>
  <p class="cap" id="chartcap">0.2억 구간별 매물 수</p>
  <div class="chartbox"><div id="chart"></div></div>
</div>

<div class="filters" id="filters"></div>

<div class="listtop">
  <button type="button" class="favbtn" id="fav-only" aria-pressed="false">☆ 즐겨찾기만</button>
  <span id="sync-status"><span class="syncdot" id="sync-dot"></span><span id="sync-label">동기화 확인 중…</span></span>
  <p class="count" id="count"></p>
</div>
<table>
  <thead><tr>
    <th class="starcol" data-s="rank" title="순위순 정렬">순위</th>
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

// 즐겨찾기·순위 — 매물 고유번호(네이버 article 번호)의 '순서 있는' 목록으로 저장
// 배열 순서 = 순위(맨 앞이 1순위). 별을 누르면 맨 끝 순위로 추가된다.
const fid=x=>String(x.u).split('/').pop();
let favs; try{favs=JSON.parse(localStorage.getItem('unjeong-fav')||'[]');}catch(e){favs=[];}
if(!Array.isArray(favs)) favs=[...favs];   // 예전 저장형식(집합) 호환
let favOnly=false;
const rankOf=x=>favs.indexOf(fid(x));       // 0-based, 없으면 -1
const isFav=x=>rankOf(x)>=0;
const saveFav=()=>localStorage.setItem('unjeong-fav',JSON.stringify(favs));
// 공유 링크(#fav=아이디.아이디...)로 들어오면 그 순위를 불러온다 (예전 링크 호환용, 평소엔 자동 동기화가 대신함)
let hadHashImport=false;
{
  const m=(location.hash||'').match(/fav=([\d.]+)/);
  if(m){
    favs=m[1].split('.').filter(Boolean);
    hadHashImport=true;
    try{ saveFav(); }catch(e){}
    try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){ location.hash=''; }
  }
}
// 기기 간 자동 동기화 — 파이어베이스 Realtime Database에 즐겨찾기·순위를 저장.
// 이 앱 전용 저장소라 코드 입력 없이, 열기만 하면 폰·맥이 항상 같은 목록을 본다.
// 실시간 스트림(EventSource)으로 다른 기기의 변경이 즉시 반영된다.
const SYNC_URL='https://unjung-ipark-default-rtdb.firebaseio.com/favs.json';
function setSyncUI(state){   // 'ok' | 'wait' | 'err'
  const d=$('#sync-dot'); if(!d) return;
  d.classList.toggle('on', state==='ok');
  d.classList.toggle('err', state==='err');
  $('#sync-label').textContent = state==='ok' ? '동기화됨' : state==='err' ? '동기화 안 됨(오프라인?)' : '동기화 확인 중…';
}
async function syncPush(){
  try{ await fetch(SYNC_URL,{method:'PUT',body:JSON.stringify(favs)}); setSyncUI('ok'); }
  catch(e){ setSyncUI('err'); }
}
function applyRemote(list){
  if(!Array.isArray(list)) list=[];
  if(JSON.stringify(list)===JSON.stringify(favs)){ setSyncUI('ok'); return; }
  favs=list; saveFav(); setSyncUI('ok'); draw();
}
let sawFirstRemote=false;
function startSync(){
  if(typeof EventSource==='undefined'){ setSyncUI('err'); return; }
  try{
    const es=new EventSource(SYNC_URL);
    es.addEventListener('put',e=>{
      let data=null; try{ data=JSON.parse(e.data).data; }catch(err){}
      if(!sawFirstRemote){
        sawFirstRemote=true;
        // 방금 공유 링크로 불러왔거나, 저장소는 비어있는데 이 기기엔 이미 즐겨찾기가 있으면
        // 지우지 말고 이 기기 값을 저장소로 올린다 (빈 저장소가 기존 즐겨찾기를 덮어쓰는 사고 방지)
        const remoteEmpty=!Array.isArray(data)||data.length===0;
        if(hadHashImport || (remoteEmpty && favs.length>0)){ syncPush(); return; }
      }
      applyRemote(data);
    });
    es.onerror=()=>setSyncUI('err');
  }catch(e){ setSyncUI('err'); }
}
startSync();
// 관심 없음 = 빈 별, 관심 있음 = 순위 번호 배지(1·2·3위 금·은·동)
function starBtn(x){
  const id=fid(x), i=favs.indexOf(id);
  if(i<0) return '<button class="star" data-id="'+id+'" title="즐겨찾기 추가" aria-label="즐겨찾기 추가">☆</button>';
  const r=i+1, col=['#f0b400','#9aa0a6','#cd7f32'][i]||'var(--series-1)';
  return '<button class="rankbadge" data-id="'+id+'" title="'+r+'순위 · 클릭하면 해제" aria-label="'+r+'순위" style="background:'+col+'">'+r+'</button>';
}

const AGO=['전세안고','월세안고'];   // 입주조건 중 기본 해제
const NULLK=' none';            // 값 없음(방 미기재 등) 인코딩
const enc=v=>(v===null||v===undefined)?NULLK:String(v);
const esA=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

// 모든 필터를 '드롭다운 + 체크박스(다중선택)'로 통일. 각 맨 위에 전체 선택.
const FILTERS=[
  {id:'trade',key:'t',label:'거래',off:['전세']},
  {id:'type', key:'y',label:'타입'},
  {id:'dong', key:'d',label:'동', fmt:v=>v+'동'},
  {id:'dir',  key:'dir',label:'향', fmt:v=>v+'향'},
  {id:'room', key:'r',label:'방', fmt:v=>v==null?'방 미기재':'방'+v, blank:true},
  {id:'cond', key:'c',label:'입주조건', fmt:v=>v||'미기재', blank:true, off:AGO},
];
const MS={};
function optsOf(f){
  let vals=[...new Set(DATA.map(x=>x[f.key]))];
  if(!f.blank) vals=vals.filter(v=>v!==''&&v!=null&&v!==0);
  return vals.sort((a,b)=>{
    if(f.id==='cond') return (AGO.includes(a)-AGO.includes(b))||String(a).localeCompare(String(b),'ko');
    if(a==null) return 1; if(b==null) return -1;
    return (typeof a==='number'&&typeof b==='number')?a-b:String(a).localeCompare(String(b),'ko');
  });
}
FILTERS.forEach(f=>{
  const opts=optsOf(f), off=new Set(f.off||[]);
  const lab=v=>f.fmt?f.fmt(v):(v===''||v==null?'미기재':String(v));
  const labMap=new Map(opts.map(v=>[enc(v),lab(v)]));
  const body='<label class="ms-opt ms-all"><input type="checkbox" data-all> 전체 선택</label>'+
    opts.map(v=>'<label class="ms-opt"><input type="checkbox" value="'+esA(enc(v))+'"'+
      (off.has(v)?'':' checked')+'> '+esA(lab(v))+' <span class="cnt"></span></label>').join('');
  const wrap=document.createElement('div');
  wrap.className='ms'; wrap.dataset.f=f.id;
  wrap.innerHTML='<button type="button" class="ms-btn" aria-expanded="false" aria-haspopup="true"></button>'+
    '<div class="ms-panel" role="group" aria-label="'+esA(f.label)+' 선택" hidden>'+body+'</div>';
  $('#filters').appendChild(wrap);
  MS[f.id]={f,opts,labMap,btn:wrap.querySelector('.ms-btn'),panel:wrap.querySelector('.ms-panel')};
});
$('#filters').insertAdjacentHTML('beforeend','<input type="search" id="f-q" placeholder="중개사·설명 검색">');

const boxesOf=id=>[...MS[id].panel.querySelectorAll('.ms-opt input[value]')];
const onSet=id=>new Set(boxesOf(id).filter(b=>b.checked).map(b=>b.value));
function tradeLabel(){ const on=boxesOf('trade').filter(b=>b.checked); return on.length===1?on[0].value:'전체'; }
function updateBtn(f){
  const M=MS[f.id], bx=boxesOf(f.id), on=bx.filter(b=>b.checked);
  let t;
  if(on.length===bx.length) t=f.label+' 전체';
  else if(on.length===0) t=f.label+' 없음';
  else if(on.length<=2) t=on.map(b=>M.labMap.get(b.value)).join('·');
  else t=f.label+' '+on.length+'개';
  M.btn.textContent=t+' ▾';
  const allBox=M.panel.querySelector('input[data-all]');
  allBox.checked=on.length===bx.length;
  allBox.indeterminate=on.length>0&&on.length<bx.length;
}

let sortKey='p', sortAsc=true;
// skip: 이 필터 하나만 빼고 계산 (체크박스 옆 건수용)
function current(skip){
  const sels={};
  FILTERS.forEach(f=>{ if(f.id!==skip) sels[f.id]=onSet(f.id); });
  const q=$('#f-q').value.trim().toLowerCase();
  return DATA.filter(x=>
    (!favOnly||isFav(x))
    && FILTERS.every(f=> f.id===skip || sels[f.id].has(enc(x[f.key])))
    && (!q||(x.b+' '+x.br.join(' ')+' '+x.m).toLowerCase().includes(q))
  ).sort((a,b)=>{
    if(sortKey==='rank'){   // 순위순: 즐겨찾기가 순위대로 위로, 나머지는 뒤에 호가순
      const ra=rankOf(a), rb=rankOf(b);
      const va=ra<0?1e9:ra, vb=rb<0?1e9:rb;
      const c=va-vb||a.p-b.p;
      return sortAsc?c:-c;
    }
    const A=a[sortKey],B=b[sortKey];
    const c=typeof A==='number'&&typeof B==='number'?A-B:String(A).localeCompare(String(B),'ko');
    return sortAsc?c:-c;
  });
}
function brokerCell(x){
  if(x.br&&x.br.length>1)
    return '<span class="cobadge">공동 '+x.br.length+'</span><span class="brokers"><span class="rep">'+x.br[0]+'</span> · '+x.br.slice(1).join(' · ')+'</span>';
  return x.b||'—';
}
function chips(x){
  let h='';
  if(x.c)h+='<span class="chip">'+x.c+'</span>';
  return h;
}
const BW=44,GAP=6,CH=150,PADB=26;
function drawStats(rows){
  const ps=rows.map(x=>x.p).sort((a,b)=>a-b);
  $('#k0').textContent=tradeLabel()+' 매물';
  if(!ps.length){
    $('#v0').textContent='0건';
    ['1','2','3'].forEach(i=>{$('#v'+i).textContent='–';$('#n'+i).textContent='';});
    $('#chart').innerHTML='<p class="cap">표시할 매물이 없습니다.</p>';
    $('#chartcap').textContent='0.2억 구간별 매물 수';
    return;
  }
  const lo_=ps[0],hi_=ps[ps.length-1];
  $('#v0').innerHTML=ps.length+'<span style="font-size:15px">건</span>';
  $('#v1').textContent=fmt(lo_);
  $('#n1').textContent=rows.find(x=>x.p===lo_).d+'동';
  $('#v2').textContent=fmt(ps[Math.floor(ps.length/2)]);
  $('#n2').textContent='현재 조건 기준';
  $('#v3').textContent=fmt(hi_);
  $('#n3').textContent='최저 대비 +'+fmt(hi_-lo_);
  $('#chartcap').textContent='0.2억 구간별 매물 수 · 총 '+ps.length+'건';

  const lo=Math.floor(lo_*5)/5; let hi=Math.ceil(hi_*5)/5;
  if(hi<=lo+1e-9) hi=+(lo+0.2).toFixed(2);   // 매물 1건 등 폭이 0이면 최소 1구간 보장
  const bins=[];
  for(let x=lo;x<hi-1e-9;x=+(x+0.2).toFixed(2)){
    const to=+(x+0.2).toFixed(2), last=to>=hi-1e-9;
    // 마지막 구간은 상한 포함 — 아니면 최고가 매물이 어느 막대에도 안 잡힌다
    bins.push({from:x,to,n:ps.filter(p=>p>=x-1e-9&&(last?p<=to+1e-9:p<to-1e-9)).length});
  }
  if(bins.reduce((a,b)=>a+b.n,0)!==ps.length)console.error('히스토그램 합 불일치');
  const maxN=Math.max(...bins.map(b=>b.n),1), W=bins.length*(BW+GAP)-GAP;
  $('#chart').innerHTML='<svg width="'+W+'" height="'+CH+'" viewBox="0 0 '+W+' '+CH+'" role="img"'+
    ' aria-label="호가 구간별 매물 수 분포. 아래 표에 매물 목록이 있습니다."><line x1="0" y1="'+(CH-PADB)+
    '" x2="'+W+'" y2="'+(CH-PADB)+'" stroke="var(--axis)" stroke-width="1"/>'+
    bins.map((b,i)=>{
      const h=b.n===0?0:Math.max(4,Math.round(b.n/maxN*(CH-PADB-14)));
      const x=i*(BW+GAP), y=CH-PADB-h;
      return '<g class="bin" tabindex="0" data-label="'+b.from.toFixed(1)+'~'+b.to.toFixed(1)+'억" data-n="'+b.n+'">'+
        '<rect class="hit" x="'+x+'" y="0" width="'+BW+'" height="'+CH+'"></rect>'+
        (b.n?'<rect class="bar" x="'+x+'" y="'+y+'" width="'+BW+'" height="'+h+'" rx="4"></rect>':'')+
        (b.n?'<text class="barval" x="'+(x+BW/2)+'" y="'+(y-5)+'">'+b.n+'</text>':'')+
        '<text class="tick" x="'+(x+BW/2)+'" y="'+(CH-8)+'">'+b.from.toFixed(1)+'</text></g>';
    }).join('')+'</svg>';
  bindBins();
}
function draw(){
  const rows=current();
  drawStats(rows);

  // 각 드롭다운의 체크박스 옆 건수 + 버튼 라벨 갱신 (그 필터만 빼고 계산)
  FILTERS.forEach(f=>{
    const pool=current(f.id);
    boxesOf(f.id).forEach(b=>{
      const cnt=b.parentNode.querySelector('.cnt');
      if(cnt) cnt.textContent=pool.filter(x=>enc(x[f.key])===b.value).length;
    });
    updateBtn(f);
  });
  $('#count').textContent=rows.length+'건 표시 중 (전체 '+DATA.length+'건)';
  const fb=$('#fav-only');
  fb.classList.toggle('on',favOnly);
  fb.setAttribute('aria-pressed',favOnly?'true':'false');
  fb.textContent=(favOnly?'★':'☆')+' 즐겨찾기만'+(favs.length?' '+favs.length+'개':'');
  $('#tb-body').innerHTML=rows.map(x=>
    '<tr data-id="'+fid(x)+'"'+(favOnly?' draggable="true"':'')+'><td class="starcell">'+(favOnly?'<span class="grip" aria-hidden="true">⠿</span>':'')+starBtn(x)+'</td><td class="price"><a href="'+x.u+'" target="_blank" rel="noopener">'+fmt(x.p)+'</a></td>'+
    '<td class="num">'+x.d+'동</td><td class="num">'+x.f+'</td><td>'+x.y+'</td>'+
    '<td>'+x.dir+'</td><td class="num">'+(x.r?'방'+x.r:'—')+'</td>'+
    '<td>'+(x.c?'<span class="chip">'+x.c+'</span>':'—')+'</td>'+
    '<td>'+(x.o.length?x.o.map(o=>'<span class="chip">'+o+'</span>').join(''):'—')+'</td>'+
    '<td>'+brokerCell(x)+'</td><td class="memo">'+x.m+'</td></tr>').join('');
  $('#mob').innerHTML=rows.map(x=>
    '<div class="item"><div class="top"><span style="display:flex;align-items:center;gap:6px">'+starBtn(x)+'<span class="price"><a href="'+x.u+'" target="_blank" rel="noopener">'+fmt(x.p)+'</a></span></span>'+
    '<span class="num">'+x.d+'동 '+x.f+'층</span></div>'+
    '<div class="meta">'+x.y+' · '+x.dir+'향'+(x.r?' · 방'+x.r:'')+'</div>'+
    '<div>'+chips(x)+x.o.map(o=>'<span class="chip">'+o+'</span>').join('')+'</div>'+
    '<div class="brokers">'+(x.br&&x.br.length>1?'<span class="cobadge">공동 '+x.br.length+'</span><span class="rep">'+x.br[0]+'</span> · '+x.br.slice(1).join(' · '):x.b)+'</div>'+
    (x.m?'<div class="memo">'+x.m+'</div>':'')+'</div>').join('');
}
document.querySelectorAll('th[data-s]').forEach(th=>th.addEventListener('click',()=>{
  const k=th.dataset.s;
  if(sortKey===k)sortAsc=!sortAsc; else {sortKey=k;sortAsc=true;}
  document.querySelectorAll('th .ar').forEach(a=>a.remove());
  th.insertAdjacentHTML('beforeend',' <span class="ar">'+(sortAsc?'▲':'▼')+'</span>');
  draw();
}));
// 필터 이벤트 (드롭다운 다중선택 공통)
$('#filters').addEventListener('change',e=>{
  const inp=e.target; if(inp.tagName!=='INPUT'||inp.type!=='checkbox') return;
  const ms=inp.closest('.ms'); if(!ms) return;
  if(inp.dataset.all!==undefined) boxesOf(ms.dataset.f).forEach(b=>b.checked=inp.checked); // 전체 선택
  draw();
});
$('#filters').addEventListener('input',e=>{ if(e.target.id==='f-q') draw(); });
$('#filters').addEventListener('click',e=>{
  const btn=e.target.closest('.ms-btn'); if(!btn) return;
  e.stopPropagation();
  const panel=btn.nextElementSibling, open=panel.hidden;
  closeAllMenus(); panel.hidden=!open; btn.setAttribute('aria-expanded',open?'true':'false');
});
function closeAllMenus(){ document.querySelectorAll('#filters .ms-panel').forEach(p=>{p.hidden=true;p.previousElementSibling.setAttribute('aria-expanded','false');}); }
document.addEventListener('click',e=>{ if(!e.target.closest('.ms')) closeAllMenus(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeAllMenus(); });

// 별/순위배지 클릭(표·모바일 공통) — 있으면 해제, 없으면 맨 끝 순위로 추가
document.addEventListener('click',e=>{
  const s=e.target.closest('.star,.rankbadge'); if(!s) return;
  const id=s.dataset.id, i=favs.indexOf(id);
  if(i>=0) favs.splice(i,1); else favs.push(id);
  saveFav(); draw(); syncPush();
});
// 즐겨찾기만 보기 — 켜면 자동으로 순위순 정렬
$('#fav-only').addEventListener('click',()=>{
  favOnly=!favOnly;
  if(favOnly){ sortKey='rank'; sortAsc=true; document.querySelectorAll('th .ar').forEach(a=>a.remove()); }
  draw();
});

// 순위 드래그 재배치 (즐겨찾기만 보기에서만) — 배열 순서를 바꿔 순위 갱신
let dragId=null;
$('#tb-body').addEventListener('dragstart',e=>{
  const tr=e.target.closest('tr'); if(!tr) return;
  dragId=tr.dataset.id; tr.classList.add('dragging'); e.dataTransfer.effectAllowed='move';
});
$('#tb-body').addEventListener('dragend',e=>{
  const tr=e.target.closest('tr'); if(tr) tr.classList.remove('dragging');
  document.querySelectorAll('#tb-body tr.dragover').forEach(t=>t.classList.remove('dragover'));
  dragId=null;
});
$('#tb-body').addEventListener('dragover',e=>{
  if(!favOnly||!dragId) return; e.preventDefault();
  const tr=e.target.closest('tr'); if(!tr||tr.dataset.id===dragId) return;
  document.querySelectorAll('#tb-body tr.dragover').forEach(t=>t.classList.remove('dragover'));
  tr.classList.add('dragover');
});
$('#tb-body').addEventListener('drop',e=>{
  if(!favOnly||!dragId) return; e.preventDefault();
  const tr=e.target.closest('tr'); if(!tr) return;
  const targetId=tr.dataset.id;
  if(targetId===dragId){ dragId=null; return; }
  const from=favs.indexOf(dragId); if(from<0) return;
  favs.splice(from,1);
  const to=favs.indexOf(targetId);
  favs.splice(to<0?favs.length:to,0,dragId);
  saveFav(); dragId=null; draw(); syncPush();
});

const tip=$('#tip');
function showTip(g,ev){
  tip.innerHTML='<b>'+g.dataset.label+'</b> · '+g.dataset.n+'건';
  const r=g.getBoundingClientRect();
  const x=ev?ev.clientX:r.left+r.width/2, y=ev?ev.clientY:r.top;
  tip.style.opacity=1;
  tip.style.left=Math.min(x+12,innerWidth-tip.offsetWidth-8)+'px';
  tip.style.top=(y-tip.offsetHeight-10)+'px';
}
function bindBins(){
  document.querySelectorAll('.bin').forEach(g=>{
    g.addEventListener('mousemove',e=>showTip(g,e));
    g.addEventListener('mouseleave',()=>tip.style.opacity=0);
    g.addEventListener('focus',()=>showTip(g,null));
    g.addEventListener('blur',()=>tip.style.opacity=0);
  });
}

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

// 오프라인 재생성: 수집 없이 data.json 캐시로 index.html만 다시 만든다
if (OFFLINE) {
  const cached = JSON.parse(fs.readFileSync(path.join(__dirname, "data.json"), "utf8"));
  fs.writeFileSync(path.join(__dirname, "index.html"), render(cached.items, cached.counts, cached.stamp));
  console.log(`✓ index.html 재생성(오프라인 캐시) — ${cached.items.length}건 (${cached.stamp})`);
  process.exit(0);
}

// ── main ── (여기서부터는 수집 서버가 필요하므로 SDK를 동적으로 불러온다)
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
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
