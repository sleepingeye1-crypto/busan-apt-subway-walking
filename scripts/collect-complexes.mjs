// 개발 단위 2: 해운대구·수영구·남구의 700세대 이상 아파트 단지 목록을 모아
// data/complexes.json 으로 저장한다.
//
// 실행: node scripts/collect-complexes.mjs
//
// 1) 공공데이터포털 단지 목록 API로 구별 단지 코드를 모은다
// 2) 단지마다 기본 정보 API로 이름·주소·세대수·동 수를 받는다
// 3) 700세대 이상만 남긴다
// 4) 카카오 주소 검색으로 단지 대표 좌표(위도·경도)를 붙인다

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { syncComplexes, trySync } from "./db-sync.mjs";

process.loadEnvFile(".env");

const DATA_KEY = process.env.DATA_GO_KR_SERVICE_KEY;
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
if (!DATA_KEY || !KAKAO_KEY) {
  console.error(".env에 DATA_GO_KR_SERVICE_KEY 와 KAKAO_REST_API_KEY 가 필요합니다.");
  process.exit(1);
}

const DISTRICTS = [
  { name: "해운대구", code: "26350" },
  { name: "수영구", code: "26500" },
  { name: "남구", code: "26290" },
];
const MIN_HOUSEHOLDS = 700;
const OUT_FILE = "data/complexes.json";

const LIST_URL = "https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4";
const BASIC_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5";
const KAKAO_ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getDataGoKrOnce(url, params) {
  const query = new URLSearchParams({ ...params, serviceKey: DATA_KEY, _type: "json" });
  const res = await fetch(`${url}?${query}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`공공데이터포털 응답을 읽을 수 없음 (HTTP ${res.status})`);
  }
  const header = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (header) throw new Error(`공공데이터포털 오류: ${header.errMsg} (${header.returnAuthMsg})`);
  return json.response?.body;
}

// 포털 서버가 가끔 "HTTP_ERROR"를 내므로 잠깐 쉬었다가 몇 번 다시 시도한다
// (키가 등록되지 않은 경우처럼 다시 해도 소용없는 오류는 바로 멈춘다)
async function getDataGoKr(url, params) {
  const RETRIES = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      return await getDataGoKrOnce(url, params);
    } catch (err) {
      const retryable = err.message.includes("HTTP_ERROR") || err.message.includes("읽을 수 없음") || err.name === "TypeError";
      if (!retryable || attempt >= RETRIES) throw err;
      await sleep(2000 * attempt);
    }
  }
}

// 받은 결과를 파일에 모아 두면, 중간에 멈춰도 다음 실행에서 이어서 받는다 (.cache/ 는 커밋하지 않는다)
const CACHE_FILE = ".cache/complexes-cache.json";
const cache = existsSync(CACHE_FILE) ? JSON.parse(await readFile(CACHE_FILE, "utf8")) : { codes: {}, info: {} };
async function saveCache() {
  await mkdir(".cache", { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache));
}

// 응답의 items 가 배열·객체·{item: ...} 중 어떤 모양이어도 배열로 바꾼다
function toArray(items) {
  if (!items) return [];
  const inner = items.item ?? items;
  return Array.isArray(inner) ? inner : [inner];
}

async function listComplexCodes(district) {
  if (cache.codes[district.code]) return cache.codes[district.code];
  const codes = [];
  for (let page = 1; ; page++) {
    const body = await getDataGoKr(LIST_URL, {
      sigunguCode: district.code,
      pageNo: String(page),
      numOfRows: "100",
    });
    const items = toArray(body?.items);
    codes.push(...items.map((it) => it.kaptCode).filter(Boolean));
    const total = Number(body?.totalCount ?? 0);
    if (items.length === 0 || codes.length >= total) break;
    await sleep(100);
  }
  cache.codes[district.code] = codes;
  await saveCache();
  return codes;
}

// 필요한 항목만 골라 캐시에 둔다 (세대수와 관계없이 모두 저장해 두면 다음 실행에서 다시 받지 않는다)
async function getBasicInfo(kaptCode) {
  if (cache.info[kaptCode]) return cache.info[kaptCode];
  const item = (await getDataGoKr(BASIC_URL, { kaptCode }))?.item;
  if (!item) throw new Error("기본 정보가 비어 있음");
  const { kaptName, kaptAddr, doroJuso, kaptdaCnt, kaptDongCnt } = item;
  cache.info[kaptCode] = { kaptName, kaptAddr, doroJuso, kaptdaCnt, kaptDongCnt };
  if (Object.keys(cache.info).length % 20 === 0) await saveCache();
  return cache.info[kaptCode];
}

async function geocode(address) {
  if (!address?.trim()) return null;
  const res = await fetch(`${KAKAO_ADDRESS_URL}?query=${encodeURIComponent(address)}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });
  if (!res.ok) throw new Error(`카카오 주소 검색 오류 (HTTP ${res.status})`);
  const doc = (await res.json()).documents?.[0];
  return doc ? { lat: Number(doc.y), lng: Number(doc.x) } : null;
}

async function main() {
  const complexes = [];
  const failed = [];

  for (const district of DISTRICTS) {
    const codes = await listComplexCodes(district);
    console.log(`${district.name}: 단지 ${codes.length}개 조회`);

    for (const code of codes) {
      try {
        const info = await getBasicInfo(code);
        await sleep(100);
        const households = Number(info?.kaptdaCnt ?? 0);
        if (households < MIN_HOUSEHOLDS) continue;

        // 지번 주소 예: "부산광역시 해운대구 우동 1234 OO아파트" → 구, 동
        const [, gu, dong] = (info.kaptAddr ?? "").split(/\s+/);
        const position =
          (await geocode(info.doroJuso)) ?? (await geocode(info.kaptAddr?.split(/\s+/).slice(0, 4).join(" ")));

        complexes.push({
          kaptCode: code,
          name: info.kaptName?.trim(),
          gu: gu ?? district.name,
          dong: dong ?? null,
          households,
          buildingCount: Number(info.kaptDongCnt ?? 0),
          roadAddress: info.doroJuso?.trim() || null,
          jibunAddress: info.kaptAddr?.trim() || null,
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
        });
      } catch (err) {
        failed.push({ kaptCode: code, reason: err.message });
      }
    }
  }

  await saveCache();

  // 한 단지라도 못 받았으면 불완전한 목록을 저장하지 않는다. 받은 결과는 캐시에 있으니 다시 실행하면 이어서 받는다
  if (failed.length) {
    console.error(`조회에 실패한 단지 ${failed.length}개 — 저장하지 않고 멈춥니다. 다시 실행하면 이어서 받습니다.`, failed.slice(0, 3));
    process.exitCode = 1;
    return false;
  }

  complexes.sort((a, b) => a.gu.localeCompare(b.gu, "ko") || a.name.localeCompare(b.name, "ko"));

  await mkdir("data", { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        source: "국토교통부 공동주택 단지 목록·기본 정보(공공데이터포털), 좌표: 카카오 주소 검색",
        minHouseholds: MIN_HOUSEHOLDS,
        count: complexes.length,
        complexes,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\n700세대 이상 단지 ${complexes.length}개를 ${OUT_FILE} 에 저장했습니다.`);
  const noPosition = complexes.filter((c) => c.lat === null);
  if (noPosition.length) console.log(`좌표를 못 찾은 단지 ${noPosition.length}개:`, noPosition.map((c) => c.name).join(", "));
  return true;
}

// JSON 백업을 저장한 뒤 DB에도 저장한다 (개발 단위 13)
main().then((saved) => saved && trySync("단지", syncComplexes)).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
