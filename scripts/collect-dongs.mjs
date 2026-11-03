// 개발 단위 4: 고른 단지 3개의 동별 좌표를 카카오 장소 검색("아파트 동" 분류)으로 모아
// data/dong-coordinates.json 으로 저장한다.
//
// 실행: node scripts/collect-dongs.mjs
//
// 동마다 "더샵센텀파크1차아파트 101동"처럼 검색해 카카오에 등록된 동을 저장한다.
// 카카오에 동별로 없는 동은 아래 MANUAL_DONGS에 직접 찍은 좌표(출처 함께 기록)로만 채운다.
// 좌표는 지어내지 않는다. 두 곳 모두에 없는 동은 결과에 넣지 않는다.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const OUT_FILE = process.env.DONGS_OUT_FILE ?? "data/dong-coordinates.json";

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

// 요청이 몰려 잠깐 막히는 경우(429, 5xx)를 위해 몇 번 다시 시도한다
async function searchKeyword(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({ query, size: "15" })}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
    );
    if (res.ok) {
      await sleep(100);
      return (await res.json()).documents;
    }
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`카카오 검색 오류 (HTTP ${res.status})`);
    await sleep(2000 * attempt);
  }
}

// ---- 전체 단지 확장 (data/complexes.json 의 단지) ----
// 카카오에서 단지를 못 찾거나 동이 하나도 없으면 결과에 넣지 않는다 → 단지 대표 위치로 계산된다.
// 동 좌표는 카카오에 등록된 것만 쓰고, 직접 찍거나 지어내지 않는다.
const COMPLEXES_FILE = process.env.COMPLEXES_FILE ?? "data/complexes.json";
const CACHE_FILE = process.env.DONGS_OUT_FILE ? ".cache/dongs-cache-test.json" : ".cache/dongs-cache.json";
const MAX_DONG_NUMBER = 40; // 한 번호대(1~40, 101~140, 201~240)에서 볼 최대 동 수
const MISS_LIMIT = 3; // 번호가 이만큼 연달아 없으면 그 번호대는 끝난 것으로 본다

// 단지 이름과 구·동이 모두 맞는 카카오 아파트를 찾는다 (이름이 같은 다른 지역 단지를 거르기 위함)
async function findKakaoComplex(c) {
  const docs = await searchKeyword(c.name);
  const matches = docs.filter(
    (d) =>
      d.category_name.endsWith("아파트") &&
      (d.address_name ?? "").includes(c.gu) &&
      (!c.dong || (d.address_name ?? "").includes(c.dong)),
  );
  return matches.find((d) => d.place_name === c.name) ?? matches[0];
}

// 번호대마다 1번부터 세어 보고, 연달아 없으면 그 번호대를 끝낸다 (1동~, 101동~, 201동~)
// 동 이름은 "101동"뿐 아니라 "TOWER1동", "A1동"처럼 앞에 글자가 붙기도 한다.
// 단지 이름이 같고 번호가 맞는 "아파트 동"만 받는다 (다른 단지의 동이 섞이지 않게)
async function findDongs(kakaoName) {
  const dongs = [];
  const seen = new Set();
  for (const base of [0, 100, 200]) {
    let misses = 0;
    for (let i = 1; i <= MAX_DONG_NUMBER && misses < MISS_LIMIT; i++) {
      const n = base + i;
      const docs = (await searchKeyword(`${kakaoName} ${n}동`)).filter((d) => {
        if (!d.category_name.endsWith("아파트 동") || !d.place_name.startsWith(`${kakaoName} `)) return false;
        const label = d.place_name.slice(kakaoName.length + 1);
        const m = label.match(/^(\D*)(\d+)동$/);
        return m !== null && Number(m[2]) === n && !seen.has(d.id);
      });
      for (const doc of docs) {
        seen.add(doc.id);
        const label = doc.place_name.slice(kakaoName.length + 1);
        dongs.push({ dong: label, lat: Number(doc.y), lng: Number(doc.x), kakaoId: doc.id, source: "카카오" });
      }
      misses = docs.length > 0 ? 0 : misses + 1;
    }
  }
  return dongs;
}

// 같은 동 이름이 두 번 이상 나오면 카카오에서 이름이 같은 다른 단지의 동이 섞인 것이다.
// 어느 쪽이 이 단지의 동인지 알 수 없으므로 추측하지 않고 동 좌표를 쓰지 않는다 (단지 대표 위치로 계산)
function hasDuplicateDongs(entry) {
  const labels = entry.dongs.map((d) => d.dong);
  return new Set(labels).size !== labels.length;
}

// 단지 대표 좌표에서 이 거리보다 멀리 떨어진 동은 이름이 같은 다른 단지의 동일 가능성이 커서 쓰지 않는다
// (동 좌표가 하나도 안 남으면 단지 대표 위치로 계산한다)
const MAX_DONG_DISTANCE_M = 1000;
function withoutFarDongs(entry) {
  const dongs = entry.dongs.filter((d) => straightMeters(entry, d) <= MAX_DONG_DISTANCE_M);
  if (dongs.length === 0) return null;
  return { ...entry, dongCount: dongs.length, dongs };
}

async function collectAuto(c) {
  const main = await findKakaoComplex(c);
  if (!main) return null;
  const dongs = await findDongs(main.place_name);
  if (dongs.length === 0) return null;
  if (hasDuplicateDongs({ dongs })) return null;
  return {
    name: c.name,
    kakaoName: main.place_name,
    address: main.road_address_name || main.address_name || null,
    jibunAddress: main.address_name || null,
    lat: Number(main.y),
    lng: Number(main.x),
    dongCount: dongs.length,
    dongs,
  };
}

// 이미 처리한 단지는 건너뛴다. 중간에 멈춰도 다음 실행에서 이어서 한다
async function collectAllAuto(curated) {
  if (!existsSync(COMPLEXES_FILE)) {
    console.log(`${COMPLEXES_FILE} 이 없어 단지 3개만 모읍니다. (node scripts/collect-complexes.mjs 로 먼저 단지 목록을 만드세요)`);
    return [];
  }
  const list = JSON.parse(await readFile(COMPLEXES_FILE, "utf8")).complexes;
  const cache = existsSync(CACHE_FILE) ? JSON.parse(await readFile(CACHE_FILE, "utf8")) : {};
  const doneNames = new Set(curated.map((c) => c.name));
  const doneAddresses = new Set(curated.map((c) => c.address).filter(Boolean));

  const found = [];
  let noCoord = 0;
  for (const [i, c] of list.entries()) {
    if (doneNames.has(c.name) || doneAddresses.has(c.roadAddress)) continue; // 처음 고른 3개
    if (!(c.name in cache)) {
      cache[c.name] = await collectAuto(c);
      await mkdir(".cache", { recursive: true });
      await writeFile(CACHE_FILE, JSON.stringify(cache));
      console.log(`  [${i + 1}/${list.length}] ${c.name}: ${cache[c.name] ? `동 ${cache[c.name].dongCount}개` : "카카오에 동 정보 없음 → 단지 대표 위치"}`);
    }
    // 이미 캐시에 있던 결과도 같은 규칙으로 거른다
    const usable = cache[c.name] && !hasDuplicateDongs(cache[c.name]) ? withoutFarDongs(cache[c.name]) : null;
    if (usable) found.push(usable);
    else noCoord++;
  }
  console.log(`동 좌표를 찾은 단지 ${found.length}개, 못 찾은 단지 ${noCoord}개`);
  return found;
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
  const curated = [];
  for (const complex of COMPLEXES) curated.push(await collectComplex(complex));
  const result = [...curated, ...(await collectAllAuto(curated))];

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
// (테스트로 다른 파일에 저장할 때는 진짜 DB에 넣지 않는다)
main()
  .then(() => !process.env.DONGS_OUT_FILE && trySync("단지", syncComplexes))
  .then(() => !process.env.DONGS_OUT_FILE && trySync("동 좌표", syncDongs))
  .catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
