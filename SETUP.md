# 새 맥에서 설치하기

매물을 직접 갱신하려면 저장소 두 개가 필요합니다.

| 저장소 | 공개 | 역할 |
|---|---|---|
| `yire99-svg/unjeong-ipark` | 공개 | 이 저장소. 사이트 + 빌더 |
| `yire99-svg/mcp-realestate` | **비공개** | 네이버·국토부에서 매물을 긁어오는 MCP 서버 |

> 페이지를 **보기만** 할 거라면 설치할 게 없습니다 → https://yire99-svg.github.io/unjeong-ipark/

## 1. 준비물

- Node.js 20 이상 (`node -v`)
- GitHub CLI (`brew install gh`)
- Claude Code

## 2. 받아오기

```sh
gh auth login                     # yire99-svg 계정으로

git clone https://github.com/yire99-svg/mcp-realestate.git ~/mcp-realestate
git clone https://github.com/yire99-svg/unjeong-ipark.git  ~/unjeong-ipark
```

두 폴더는 **나란히** 두는 걸 권장합니다(`~/mcp-realestate`, `~/unjeong-ipark`).
빌더가 자동으로 옆 폴더를 찾습니다. 다른 곳에 뒀다면 `MCP_REALESTATE`로 알려주세요.

```sh
MCP_REALESTATE=/원하는/경로/index.js node build.mjs
```

## 3. 의존성 설치

```sh
cd ~/mcp-realestate && npm install && npx playwright install chromium
cd ~/unjeong-ipark  && npm install && npx playwright install chromium
```

`npx playwright install chromium`은 **두 폴더 모두에서** 실행하세요. 네이버가 헤드리스
브라우저를 감지해 막기 때문에 실제 크로미움으로 우회하는데, Playwright는 버전마다
전용 브라우저 빌드를 씁니다. 두 폴더의 Playwright 버전은 `1.61.0`으로 고정해 뒀으므로
두 번째 명령은 캐시를 재사용해 금방 끝납니다.

## 4. Claude Code에 MCP 서버 등록 (선택)

대화 중에 매물을 조회하고 싶을 때만 필요합니다. 사이트 갱신만 할 거면 건너뛰어도 됩니다.

```sh
claude mcp add realestate -- node ~/mcp-realestate/index.js
```

등록 후 Claude Code를 재시작하면 툴 8개가 붙습니다.

## 5. 확인

```sh
cd ~/unjeong-ipark
node build.mjs      # 매물 수집 → index.html 재생성 (30초쯤 걸립니다)
node shot.mjs       # 라이트/다크/모바일 렌더링 확인 → /tmp/shot-*.png
```

`✓ index.html 생성 — 매매 NNN건 …`이 나오면 정상입니다.

## 6. 갱신하고 배포

```sh
./refresh.sh
```

빌드 → 변경이 있을 때만 커밋·푸시합니다. 1~2분 뒤 사이트에 반영됩니다.
수집이 0건이면 종료 코드 1로 실패하므로 빈 페이지가 배포될 일은 없습니다.

## 참고

- `mcp-realestate/index.js`에 data.go.kr API 키가 코드에 들어 있습니다.
  비공개 저장소라 괜찮지만, 공개로 바꿀 일이 생기면 먼저 환경변수로 빼세요.
- 네이버가 사이트 구조를 또 바꾸면 수집이 깨질 수 있습니다.
  그때는 `cd ~/mcp-realestate && node smoke.mjs`로 어느 소스가 죽었는지 바로 확인됩니다.

## 회사 맥에서 지우기

```sh
rm -rf ~/mcp-realestate ~/unjeong-ipark
claude mcp remove realestate
```

사이트는 GitHub에 있으므로 로컬을 비워도 주소는 그대로 살아 있습니다.
