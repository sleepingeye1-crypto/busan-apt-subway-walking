// 개발 단위 4: 고른 단지 3개의 동별 좌표를 카카오 장소 검색("아파트 동" 분류)으로 모아
// data/dong-coordinates.json 으로 저장한다.
//
// 실행: node scripts/collect-dongs.mjs
//
// 동마다 "더샵센텀파크1차아파트 101동"처럼 검색하고, 카카오에 등록된 동만 저장한다.
// 좌표는 지어내지 않는다. 카카오에 없는 동은 결과에 넣지 않고 따로 알려준다.

import { mkdir, writeFile } from "node:fs/promises";

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
    if (doc) dongs.push({ dong: `${n}동`, lat: Number(doc.y), lng: Number(doc.x), kakaoId: doc.id });
  }

  return {
    name: complex.name,
    kakaoName: complex.kakaoName,
    address: main?.road_address_name || main?.address_name || null,
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
        source: "카카오 장소 검색 (아파트 동 분류)",
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

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
