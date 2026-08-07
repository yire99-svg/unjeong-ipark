#!/bin/sh
# 최신 매물로 페이지를 다시 만들고 배포한다.
set -e
cd "$(dirname "$0")"

node build.mjs

if git diff --quiet -- index.html data.json; then
  echo "변경 없음 — 배포 생략"
  exit 0
fi

git add index.html data.json
git commit -m "매물 갱신 $(date '+%Y-%m-%d %H:%M')"
git push
echo "배포됨 — 1~2분 뒤 페이지에 반영됩니다."
