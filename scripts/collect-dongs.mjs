// 개발 단위 4: 고른 단지 3개의 동별 좌표를 카카오 장소 검색("아파트 동" 분류)으로 모아
// data/dong-coordinates.json 으로 저장한다.
//
// 실행: node scripts/collect-dongs.mjs
//
// 동마다 "더샵센텀파크1차아파트 101동"처럼 검색해 카카오에 등록된 동을 저장한다.
// 카카오에 동별로 없는 동은 아래 MANUAL_DONGS에 직접 찍은 좌표(출처 함께 기록)로만 채운다.
// 좌표는 지어내지 않는다. 두 곳 모두에 없는 동은 결과에 넣지 않는다.

import { mkdir, writeFile } from "node:fs/promises";
import { syncComplexes, syncDongs, trySync } from "./db-sync.mjs";

process.loadEnvFile(".env");

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
if (!KAKAO_KEY) {
  console.error(".env에 KAKAO_REST_API_KEY 가 필요합니다.");
  process.exit(1);
}

// kakaoName: 카카오에 등록된 단지 이름 (동 이름 앞부분과 같다)
const COMPLEXES = [
  { name: "더샵센텀포레", kakaoName: "부산더샵센텀포레아파트" },
  { name: "대연힐스테이트푸르지오", kakaoName: "대연힐스테이트푸르지오아파트" },
  { name: "더샵센텀파크1차", kakaoName: "더샵센텀파크1차아파트" },
];
const DONG_RANGE = { from: 101, to: 130 };
const OUT_FILE = "data/dong-coordinates.json";

// 카카오에 동별로 등록되지 않은 동은 직접 찍은 좌표를 쓴다 (PRD 6번: 카카오에 없는 동만 직접 찍는다)
// 대연힐스테이트푸르지오 113·114동은 카카오에 "(113동,114동)" 한 곳으로만 등록돼 있어,
// OpenStreetMap 건물(ref=113, ref=114)의 중심 좌표를 쓴다. 같은 번지의 115동은 오피스텔이라 넣지 않는다.
const MANUAL_DONGS = {
  대연힐스테이트푸르지오: [
    { dong: "113동", lat: 35.1402331, lng: 129.1038525, source: "OpenStreetMap 건물 ref=113" },
    { dong: "114동", lat: 35.1399464, lng: 129.1033158, source: "OpenStreetMap 건물 ref=114" },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchKeyword(query) {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({ query, size: "15" })}`,
    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
  );
  if (!res.ok) throw new Error(`카카오 검색 오류 (HTTP ${res.status})`);
  await sleep(100);
  return (await res.json()).documents;
}

async function collectComplex(complex) {
  // 단지 자체 정보(주소, 대표 좌표)
  const [main] = (await searchKeyword(complex.kakaoName)).filter(
    (d) => d.place_name === complex.kakaoName && d.category_name.endsWith("아파트"),
  );

  const dongs = [];
  for (let n = DONG_RANGE.from; n <= DONG_RANGE.to; n++) {
    const doc = (await searchKeyword(`${complex.kakaoName} ${n}동`)).find(
      (d) => d.category_name.endsWith("아파트 동") && d.place_name === `${complex.kakaoName} ${n}동`,
    );
    if (doc) dongs.push({ dong: `${n}동`, lat: Number(doc.y), lng: Number(doc.x), kakaoId: doc.id, source: "카카오" });
  }
  // 카카오에서 찾지 못한 동만 직접 찍은 좌표로 채운다 (카카오에 생기면 카카오 좌표가 우선)
  for (const manual of MANUAL_DONGS[complex.name] ?? []) {
    if (!dongs.some((d) => d.dong === manual.dong)) dongs.push({ ...manual, kakaoId: null });
  }
  dongs.sort((a, b) => Number(a.dong.replace(/\D/g, "")) - Number(b.dong.replace(/\D/g, "")));

  // 단지 자체를 카카오에서 못 찾으면 주소·대표 좌표가 비게 되므로 미리 알려준다
  if (!main) console.warn(`  경고: ${complex.kakaoName} 단지 정보를 카카오에서 찾지 못해 주소·대표 좌표가 비어 있습니다.`);

  return {
    name: complex.name,
    kakaoName: complex.kakaoName,
    address: main?.road_address_name || main?.address_name || null,
    // 지번 주소 예: "부산 수영구 민락동 765" → 검색 결과의 구·동 표시에 쓴다
    jibunAddress: main?.address_name || null,
    lat: main ? Number(main.y) : null,
    lng: main ? Number(main.x) : null,
    dongCount: dongs.length,
    dongs,
  };
}

// 두 좌표 사이 직선거리(m) — 이상한 좌표를 찾는 점검용으로만 쓴다
function straightMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function main() {
  const result = [];
  for (const complex of COMPLEXES) result.push(await collectComplex(complex));

  await mkdir("data", { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        source: "카카오 장소 검색 (아파트 동 분류), 일부 동은 OpenStreetMap 건물 위치",
        complexes: result,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`${OUT_FILE} 에 저장했습니다.`);
  for (const c of result) {
    const numbers = c.dongs.map((d) => d.dong.replace("동", "")).join(",");
    console.log(`  ${c.name}: 동 ${c.dongCount}개 [${numbers}] (${c.address ?? "주소 없음"})`);
    // 단지 대표 좌표에서 600m 넘게 떨어진 동은 잘못 등록됐을 수 있어 알려준다
    if (c.lat !== null) {
      const far = c.dongs.filter((d) => straightMeters(c, d) > 600);
      if (far.length) console.log(`    확인 필요(단지 중심에서 600m 초과): ${far.map((d) => d.dong).join(", ")}`);
    }
  }
}

// JSON 백업을 저장한 뒤 DB에도 저장한다 (동 표는 단지 표를 참조하므로 단지를 먼저 저장한다)
main()
  .then(() => trySync("단지", syncComplexes))
  .then(() => trySync("동 좌표", syncDongs))
  .catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
