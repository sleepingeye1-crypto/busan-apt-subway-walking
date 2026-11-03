// 개발 단위 5: 동마다 가장 가까운 지하철 출구 1개까지의 실제 도보 거리를 계산해
// data/walking-distances.json 으로 저장한다.
//
// 실행: node scripts/calc-walking.mjs
//
// 1) 출발점: data/dong-coordinates.json 의 동 좌표.
//    data/complexes.json 이 있으면, 동 좌표가 없는 단지는 단지 대표 좌표로 계산한다
// 2) 후보 출구: 출발점에서 직선거리로 가까운 출구 몇 개만 고른다 (서버 요청을 줄이기 위한 거르기 용도)
// 3) 도보 거리: OpenStreetMap 도보 길찾기 서버의 table 기능으로 후보 출구까지의 실제 도보 거리를 한 번에 받는다
// 4) 실제 도보 거리가 가장 짧은 출구 1개를 고른다
//
// 거리는 서버가 준 값(m)을 그대로 저장한다. 반올림·1.5km 초과 처리는 개발 단위 6에서 한다.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { syncWalking, trySync } from "./db-sync.mjs";

const OSRM_TABLE_URL = "https://routing.openstreetmap.de/routed-foot/table/v1/foot";
const USER_AGENT = "my-app-practice/0.1 (busan apartment subway walking distance study)";
const CANDIDATE_COUNT = 5; // 직선거리로 가까운 출구 몇 개를 후보로 볼지
const CANDIDATE_MAX_STRAIGHT_M = 2000; // 직선거리로 이보다 먼 출구는 후보에서 뺀다
// 한꺼번에 많이 부르면 서버가 막아서, 10분에 100건 미만으로 천천히 요청한다
const REQUEST_GAP_MS = 15000; // 7초 간격으로도 20분 만에 막혀서 15초에 1건(10분에 40건)으로 늦춘다
const OUT_FILE = "data/walking-distances.json";
// 계산이 끝난 출발점은 여기에 모아 두고, 다시 실행하면 이어서 계산한다 (.cache/ 는 커밋하지 않는다)
const CACHE_FILE = ".cache/walking-cache.json";
const REQUEST_TIMEOUT_MS = 20000; // 서버가 이 시간 안에 답하지 않으면 실패로 보고 다시 시도한다
const REQUEST_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 5; // 서버 실패가 이만큼 연달아 나면 서버가 막힌 것으로 보고 멈춘다

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

// 두 좌표 사이 직선거리(m) — 후보 출구를 거르는 데만 쓰고, 결과 거리로는 쓰지 않는다
function straightMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 출구 목록을 한 줄로 편다. 환승역이 같은 출구를 공유하면 한 번만 넣는다
function flattenExits(exitData) {
  const exits = new Map();
  for (const station of exitData.stations) {
    if (station.sharedFrom) continue;
    for (const exit of station.exits) {
      exits.set(exit.id, { ...exit, station: station.name, line: station.line });
    }
  }
  return [...exits.values()];
}

// 출발점 목록: 동 좌표가 있는 단지는 동마다, 없는 단지는 단지 대표 좌표 1개
async function loadOrigins() {
  const dongData = await readJson("data/dong-coordinates.json");
  const origins = [];
  for (const c of dongData.complexes) {
    for (const d of c.dongs) {
      origins.push({ complex: c.name, dong: d.dong, basis: "dong", lat: d.lat, lng: d.lng });
    }
  }

  if (existsSync("data/complexes.json")) {
    // 동 좌표가 있는 단지는 이름이나 도로명 주소가 같은 목록 항목을 건너뛴다 (같은 단지를 두 번 계산하지 않기 위함)
    const withDongs = new Set(dongData.complexes.map((c) => c.address));
    const withDongNames = new Set(dongData.complexes.map((c) => c.name));
    const complexData = await readJson("data/complexes.json");
    for (const c of complexData.complexes) {
      if (withDongs.has(c.roadAddress) || withDongNames.has(c.name)) continue;
      origins.push({
        complex: c.name,
        kaptCode: c.kaptCode,
        dong: null,
        basis: "complex",
        lat: c.lat,
        lng: c.lng,
      });
    }
  }
  return origins;
}

// 서버가 느리거나 잠깐 막히면 쉬었다가 몇 번 다시 시도한다 (그래도 안 되면 오류를 던진다)
async function fetchTable(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`도보 길찾기 서버 오류 (HTTP ${res.status})`);
      const json = await res.json();
      // "NoRoute" 같은 정상 응답이 아니면 오류로 본다
      if (json.code !== "Ok") throw new Error(`도보 길찾기 서버 오류 (${json.code})`);
      return json;
    } catch (err) {
      if (attempt >= REQUEST_RETRIES) throw err;
      await sleep(3000 * attempt);
    }
  }
}

async function walkingTable(origin, candidates) {
  const coords = [origin, ...candidates].map((p) => `${p.lng},${p.lat}`).join(";");
  const destinations = candidates.map((_, i) => i + 1).join(";");
  const url = `${OSRM_TABLE_URL}/${coords}?sources=0&destinations=${destinations}&annotations=distance,duration`;
  const json = await fetchTable(url);
  // snap: 서버가 좌표를 가장 가까운 길 위로 옮긴 거리(m). 이 구간은 도보 거리에 포함되지 않는다
  return {
    distances: json.distances[0],
    durations: json.durations[0],
    originSnap: json.sources[0].distance,
    exitSnaps: json.destinations.map((d) => d.distance),
  };
}

async function calcOne(origin, exits) {
  if (origin.lat === null || origin.lng === null) return { status: "no-coordinate" };

  const candidates = exits
    .map((e) => ({ ...e, straight: straightMeters(origin, e) }))
    .filter((e) => e.straight <= CANDIDATE_MAX_STRAIGHT_M)
    .sort((a, b) => a.straight - b.straight)
    .slice(0, CANDIDATE_COUNT);
  if (candidates.length === 0) return { status: "no-exit-nearby" };

  const { distances, durations, originSnap, exitSnaps } = await walkingTable(origin, candidates);
  let best = null;
  candidates.forEach((exit, i) => {
    if (distances[i] === null) return; // 경로를 못 찾은 출구는 건너뛴다
    if (!best || distances[i] < best.walkingMeters) {
      best = { exit, walkingMeters: distances[i], walkingSeconds: durations[i], exitSnap: exitSnaps[i] };
    }
  });
  if (!best) return { status: "no-route" };

  const { exit } = best;
  return {
    status: "ok",
    walkingMeters: best.walkingMeters,
    walkingSeconds: best.walkingSeconds,
    snapMeters: { start: originSnap, end: best.exitSnap },
    exit: { station: exit.station, line: exit.line, name: exit.name, number: exit.number, lat: exit.lat, lng: exit.lng },
  };
}

async function main() {
  const exitData = await readJson("data/subway-exits.json");
  const exits = flattenExits(exitData);
  // --only=단지이름 : 그 단지만 계산해 화면에 보여 준다 (시험용이라 JSON·DB에는 저장하지 않는다)
  const onlyName = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const origins = (await loadOrigins()).filter((o) => !onlyName || o.complex === onlyName);
  if (onlyName && origins.length === 0) throw new Error(`"${onlyName}" 단지의 출발점이 없습니다.`);
  console.log(`출발점 ${origins.length}개, 출구 ${exits.length}개로 계산을 시작합니다. (1초에 1건씩 요청)`);

  // 출발점 좌표와 출구 기준일이 같을 때만 이전 결과를 다시 쓴다 (서버 실패 결과는 저장해 두지 않는다)
  const cache = existsSync(CACHE_FILE) ? await readJson(CACHE_FILE) : {};
  const cacheKey = (o) => `${exitData.generatedAt}|${o.complex}|${o.dong ?? ""}|${o.basis}|${o.lat},${o.lng}`;

  const items = [];
  let consecutiveFailures = 0;
  let stopped = false;
  for (const [i, origin] of origins.entries()) {
    const key = cacheKey(origin);
    const label = `${origin.complex} ${origin.dong ?? "(단지 대표 위치)"}`;
    if (cache[key]) {
      items.push({ ...origin, ...cache[key] });
      continue;
    }

    let result;
    try {
      result = await calcOne(origin, exits);
      consecutiveFailures = 0;
      cache[key] = result;
      if (Object.keys(cache).length % 20 === 0) {
        await mkdir(".cache", { recursive: true });
        await writeFile(CACHE_FILE, JSON.stringify(cache));
      }
    } catch (err) {
      result = { status: "failed", reason: err.message };
      consecutiveFailures++;
    }
    items.push({ ...origin, ...result });
    console.log(
      `  [${i + 1}/${origins.length}] ${label}: ` +
        (result.status === "ok" ? `${result.exit.name} 도보 ${Math.round(result.walkingMeters)}m` : result.status),
    );

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      stopped = true;
      break;
    }
    await sleep(REQUEST_GAP_MS);
  }
  await mkdir(".cache", { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache));

  // 서버 실패("failed")는 저장하지 않는다. 저장하면 막힌 서버 때문에 생긴 값이 "불가능"으로 보이기 때문이다.
  // 실패한 곳과 아직 계산 안 한 곳은 DB에 없으므로 화면에서 "정보 없음"으로 보이고, 다시 실행하면 이어서 채운다
  const failedCount = items.filter((it) => it.status === "failed").length;
  const notDone = origins.length - items.length;
  const savedItems = items.filter((it) => it.status !== "failed");
  if (stopped) {
    console.error(`\n도보 길찾기 서버가 ${MAX_CONSECUTIVE_FAILURES}번 연달아 실패해 멈춥니다. 서버가 풀린 뒤 다시 실행하면 이어서 합니다.`);
  }

  if (onlyName) {
    console.log(`\n--only 시험 실행이라 JSON·DB에는 저장하지 않았습니다. (계산 결과는 .cache/ 에 남아 다음 전체 실행에서 다시 쓰입니다)`);
    return;
  }

  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        source: "© OpenStreetMap contributors — routing.openstreetmap.de (foot)",
        exitDataDate: exitData.generatedAt,
        count: savedItems.length,
        items: savedItems,
      },
      null,
      2,
    ) + "\n",
  );

  const noRoute = savedItems.filter((it) => it.status !== "ok").length;
  console.log(`\n${OUT_FILE} 에 ${savedItems.length}건 저장했습니다. (거리 있음 ${savedItems.length - noRoute}건, 근처 출구 없음·경로 없음 ${noRoute}건)`);
  console.log(`저장하지 않은 것: 서버 실패 ${failedCount}건, 아직 계산 안 함 ${notDone}건`);

  // JSON 백업을 저장한 뒤 DB에도 저장한다 (개발 단위 13)
  await trySync("도보 거리", syncWalking);
  if (stopped || failedCount > 0 || notDone > 0) process.exitCode = 1; // 아직 다 끝나지 않았음을 알린다
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
