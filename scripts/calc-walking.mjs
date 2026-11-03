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
import { readFile, writeFile } from "node:fs/promises";
import { syncWalking, trySync } from "./db-sync.mjs";

const OSRM_TABLE_URL = "https://routing.openstreetmap.de/routed-foot/table/v1/foot";
const USER_AGENT = "my-app-practice/0.1 (busan apartment subway walking distance study)";
const CANDIDATE_COUNT = 5; // 직선거리로 가까운 출구 몇 개를 후보로 볼지
const CANDIDATE_MAX_STRAIGHT_M = 2000; // 직선거리로 이보다 먼 출구는 후보에서 뺀다
const REQUEST_GAP_MS = 1100; // 공개 서버 조건: 1초에 1건 정도
const OUT_FILE = "data/walking-distances.json";

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
    const withDongs = new Set(dongData.complexes.map((c) => c.address));
    const complexData = await readJson("data/complexes.json");
    for (const c of complexData.complexes) {
      if (withDongs.has(c.roadAddress)) continue;
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

async function walkingTable(origin, candidates) {
  const coords = [origin, ...candidates].map((p) => `${p.lng},${p.lat}`).join(";");
  const destinations = candidates.map((_, i) => i + 1).join(";");
  const url = `${OSRM_TABLE_URL}/${coords}?sources=0&destinations=${destinations}&annotations=distance,duration`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`도보 길찾기 서버 오류 (HTTP ${res.status})`);
  const json = await res.json();
  if (json.code !== "Ok") throw new Error(`도보 길찾기 서버 오류 (${json.code})`);
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
  const origins = await loadOrigins();
  console.log(`출발점 ${origins.length}개, 출구 ${exits.length}개로 계산을 시작합니다. (1초에 1건씩 요청)`);

  const items = [];
  for (const [i, origin] of origins.entries()) {
    let result;
    try {
      result = await calcOne(origin, exits);
    } catch (err) {
      result = { status: "failed", reason: err.message };
    }
    items.push({ ...origin, ...result });
    const label = `${origin.complex} ${origin.dong ?? "(단지 대표 위치)"}`;
    console.log(
      `  [${i + 1}/${origins.length}] ${label}: ` +
        (result.status === "ok" ? `${result.exit.name} 도보 ${Math.round(result.walkingMeters)}m` : result.status),
    );
    await sleep(REQUEST_GAP_MS);
  }

  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        source: "© OpenStreetMap contributors — routing.openstreetmap.de (foot)",
        exitDataDate: exitData.generatedAt,
        count: items.length,
        items,
      },
      null,
      2,
    ) + "\n",
  );

  const failed = items.filter((it) => it.status !== "ok");
  console.log(`\n${OUT_FILE} 에 저장했습니다. 성공 ${items.length - failed.length}개, 실패 ${failed.length}개`);
}

// JSON 백업을 저장한 뒤 DB에도 저장한다 (개발 단위 13)
main().then(() => trySync("도보 거리", syncWalking)).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
