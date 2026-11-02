// 개발 단위 3: 해운대구·수영구·남구 주변의 부산 2·3호선, 동해선 지하철 출구 좌표를 모아
// data/subway-exits.json 으로 저장한다.
//
// 실행: node scripts/collect-exits.mjs
//
// 1) 카카오 카테고리 검색(SW8)으로 대상 지역의 지하철역을 모은다
// 2) 역마다 출구 번호(1~20번)별로 카카오 키워드 검색을 해서 "지하철출구" 분류 장소를 모은다
// 3) 출구가 없는 환승역은 이름이 같은 다른 노선 역의 출구를 함께 쓴다
// 4) 그래도 출구가 하나도 없는 역은 따로 알려준다 (빠진 출구 점검)

import { mkdir, writeFile } from "node:fs/promises";

process.loadEnvFile(".env");

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
if (!KAKAO_KEY) {
  console.error(".env에 KAKAO_REST_API_KEY 가 필요합니다.");
  process.exit(1);
}

// 해운대구·수영구·남구를 덮는 사각형 (경계 주변 역도 포함되도록 여유를 둠)
const AREA = { west: 129.05, south: 35.08, east: 129.24, north: 35.23 };
const TILE = 0.03; // 카테고리 검색은 한 번에 최대 45개라 작은 칸으로 나눠 검색한다
const LINES = ["부산2호선", "부산3호선", "동해선"];
const OUT_FILE = "data/subway-exits.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function kakao(path, params) {
  const res = await fetch(`https://dapi.kakao.com${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });
  if (!res.ok) throw new Error(`카카오 검색 오류 (HTTP ${res.status})`);
  await sleep(100);
  return res.json();
}

// 여러 페이지(최대 3페이지 × 15개)를 모두 받아 온다
async function searchAllPages(path, params) {
  const docs = [];
  for (let page = 1; page <= 3; page++) {
    const json = await kakao(path, { ...params, page: String(page), size: "15" });
    docs.push(...json.documents);
    if (json.meta.is_end) break;
  }
  return docs;
}

// 장소 분류 "교통,수송 > 지하철,전철 > 부산2호선" → "부산2호선"
const lineOf = (doc) => LINES.find((line) => doc.category_name.endsWith(line) || doc.place_name.includes(line));

async function collectStations() {
  const stations = new Map();
  for (let x = AREA.west; x < AREA.east; x += TILE) {
    for (let y = AREA.south; y < AREA.north; y += TILE) {
      const rect = [x, y, Math.min(x + TILE, AREA.east), Math.min(y + TILE, AREA.north)]
        .map((v) => v.toFixed(4))
        .join(",");
      const docs = await searchAllPages("/v2/local/search/category.json", { category_group_code: "SW8", rect });
      for (const doc of docs) {
        const line = lineOf(doc);
        if (line && !stations.has(doc.id)) {
          stations.set(doc.id, { id: doc.id, name: doc.place_name, line, lat: Number(doc.y), lng: Number(doc.x) });
        }
      }
    }
  }
  return [...stations.values()];
}

const MAX_EXIT_NUMBER = 20;

async function collectExits(station) {
  // "출구"로 한 번에 검색하면 일부만 나오므로 "해운대역 부산2호선 1번출구"처럼 번호마다 검색한다
  const exits = [];
  for (let n = 1; n <= MAX_EXIT_NUMBER; n++) {
    const { documents } = await kakao("/v2/local/search/keyword.json", {
      query: `${station.name} ${n}번출구`,
      size: "15",
    });
    const doc = documents.find(
      (d) =>
        d.category_name.endsWith("지하철출구") &&
        d.place_name.startsWith(station.name) &&
        new RegExp(`(^|\\D)${n}\\s*번\\s*출구`).test(d.place_name.slice(station.name.length)),
    );
    if (doc) exits.push({ id: doc.id, name: doc.place_name, number: n, lat: Number(doc.y), lng: Number(doc.x) });
  }
  return exits;
}

// 환승역은 출구가 다른 노선 이름으로만 등록된 경우가 있다 (예: 수영역 3호선 → 수영역 2호선 출구)
// 이때는 이름이 같은 역의 출구를 함께 쓰고, 어느 역에서 가져왔는지 sharedFrom 에 남긴다
function shareTransferExits(result) {
  const baseName = (s) => s.name.replace(` ${s.line}`, "");
  for (const station of result.filter((s) => s.exitCount === 0)) {
    const donor = result.find((s) => s !== station && s.exitCount > 0 && baseName(s) === baseName(station));
    if (donor) {
      station.exits = donor.exits;
      station.exitCount = donor.exitCount;
      station.sharedFrom = donor.name;
    }
  }
}

async function main() {
  const stations = await collectStations();
  console.log(`대상 지역 역 ${stations.length}개 조회`);

  const result = [];
  for (const station of stations) {
    const exits = await collectExits(station);
    result.push({ ...station, exitCount: exits.length, exits });
  }
  shareTransferExits(result);
  result.sort((a, b) => a.line.localeCompare(b.line, "ko") || a.name.localeCompare(b.name, "ko"));

  const exitTotal = result.filter((s) => !s.sharedFrom).reduce((sum, s) => sum + s.exitCount, 0);
  await mkdir("data", { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        source: "카카오 장소 검색 (지하철역 카테고리, 지하철출구 분류)",
        lines: LINES,
        stationCount: result.length,
        exitCount: exitTotal,
        stations: result,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`출구 ${exitTotal}개를 ${OUT_FILE} 에 저장했습니다.`);
  for (const s of result) {
    const numbers = s.exits.map((e) => e.number).join(",");
    console.log(`  ${s.name}: 출구 ${s.exitCount}개 [${numbers}]${s.sharedFrom ? ` (${s.sharedFrom} 출구 공유)` : ""}`);
  }
  const missing = result.filter((s) => s.exitCount === 0);
  if (missing.length) console.log(`\n출구가 검색되지 않은 역 ${missing.length}개:`, missing.map((s) => s.name).join(", "));
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
