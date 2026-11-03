// 개발 단위 13: data/*.json 의 내용을 Supabase DB에 저장한다.
// 수집 스크립트들이 JSON을 쓴 뒤 이 파일의 함수를 불러 DB에도 저장한다 (JSON은 백업으로 남는다).
//
// 직접 실행하면 있는 JSON을 모두 DB로 옮긴다:  node scripts/db-sync.mjs
// 쓰기에는 서버 전용 키(SUPABASE_SERVICE_ROLE_KEY)를 쓴다. 화면 코드에서는 이 키를 쓰지 않는다.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

function client() {
  if (!process.env.SUPABASE_URL) process.loadEnvFile(".env");
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(".env에 SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// 한 번에 너무 많이 보내지 않도록 나눠서 저장한다
async function upsertRows(db, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table} 저장 실패: ${error.message}`);
  }
}

async function saveMeta(db, key, json) {
  await upsertRows(db, "data_meta", [{ key, generated_at: json.generatedAt, source: json.source ?? null }], "key");
}

// 지번 주소 "부산 수영구 민락동 765" / "부산광역시 해운대구 우동 1234" → 구, 동
const guDongOf = (jibun) => {
  const [, gu = null, dong = null] = (jibun ?? "").split(/\s+/);
  return { gu, dong };
};

// 단지 표: 동 좌표를 모은 단지(data/dong-coordinates.json)와 전체 목록(data/complexes.json)을 합친다.
// 같은 도로명 주소는 한 번만 넣는다 (동 좌표 쪽을 우선)
export async function syncComplexes(db = client()) {
  const dongData = await readJson("data/dong-coordinates.json");
  const listData = existsSync("data/complexes.json") ? await readJson("data/complexes.json") : null;
  // 동 좌표를 모은 단지에 단지 목록의 세대수·단지 코드를 합친다 (이름 또는 도로명 주소가 같으면 같은 단지)
  const listed = (c) => listData?.complexes.find((l) => l.name === c.name || (c.address && l.roadAddress === c.address));
  const rows = dongData.complexes.map((c) => {
    const l = listed(c);
    return {
      name: c.name,
      kapt_code: l?.kaptCode ?? null,
      ...(l ? { gu: l.gu ?? null, dong: l.dong ?? null } : guDongOf(c.jibunAddress)),
      households: l?.households ?? null,
      building_count: l?.buildingCount || null, // 0이면 모르는 값으로 본다
      address: c.address ?? null,
      jibun_address: c.jibunAddress ?? null,
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      source: dongData.source ?? null,
    };
  });

  if (listData) {
    const seenAddress = new Set(dongData.complexes.map((c) => c.address));
    for (const c of listData.complexes) {
      if (seenAddress.has(c.roadAddress) || rows.some((r) => r.name === c.name)) continue;
      rows.push({
        name: c.name,
        kapt_code: c.kaptCode ?? null,
        gu: c.gu ?? null,
        dong: c.dong ?? null,
        households: c.households ?? null,
        building_count: c.buildingCount || null,
        address: c.roadAddress ?? null,
        jibun_address: c.jibunAddress ?? null,
        lat: c.lat,
        lng: c.lng,
        source: listData.source ?? null,
      });
    }
  }
  if (listData) await saveMeta(db, "complexes", listData);
  await upsertRows(db, "complexes", rows, "name");
  await saveMeta(db, "dongs", dongData);
  return rows.length;
}

export async function syncDongs(db = client()) {
  const dongData = await readJson("data/dong-coordinates.json");
  const rows = dongData.complexes.flatMap((c) =>
    c.dongs.map((d) => ({
      complex_name: c.name,
      dong: d.dong,
      lat: d.lat,
      lng: d.lng,
      kakao_id: d.kakaoId ?? null,
      source: d.source ?? null,
    })),
  );
  await upsertRows(db, "dongs", rows, "complex_name,dong");
  return rows.length;
}

export async function syncExits(db = client()) {
  const exitData = await readJson("data/subway-exits.json");
  const rows = new Map();
  for (const station of exitData.stations) {
    if (station.sharedFrom) continue; // 환승역이 같은 출구를 공유하면 한 번만 넣는다
    for (const e of station.exits) {
      rows.set(e.id, {
        id: e.id,
        station_id: station.id,
        station: station.name,
        line: station.line,
        name: e.name,
        number: e.number ?? null,
        lat: e.lat,
        lng: e.lng,
      });
    }
  }
  await upsertRows(db, "subway_exits", [...rows.values()], "id");
  await saveMeta(db, "subway_exits", exitData);
  return rows.size;
}

// 도보 거리는 계산할 때마다 전체를 다시 만들므로, 비우고 새로 넣는다
export async function syncWalking(db = client()) {
  const walkData = await readJson("data/walking-distances.json");
  const rows = walkData.items.map((it) => ({
    complex_name: it.complex,
    dong: it.dong ?? null,
    basis: it.basis,
    lat: it.lat ?? null,
    lng: it.lng ?? null,
    status: it.status,
    reason: it.reason ?? null,
    walking_meters: it.walkingMeters ?? null,
    walking_seconds: it.walkingSeconds ?? null,
    snap_start: it.snapMeters?.start ?? null,
    snap_end: it.snapMeters?.end ?? null,
    exit_station: it.exit?.station ?? null,
    exit_line: it.exit?.line ?? null,
    exit_name: it.exit?.name ?? null,
    exit_number: it.exit?.number ?? null,
    exit_lat: it.exit?.lat ?? null,
    exit_lng: it.exit?.lng ?? null,
  }));
  const { error } = await db.from("walking_distances").delete().gte("id", 0);
  if (error) throw new Error(`walking_distances 비우기 실패: ${error.message}`);
  await upsertRows(db, "walking_distances", rows);
  await saveMeta(db, "walking_distances", { ...walkData, source: walkData.source });
  return rows.length;
}

// 수집 스크립트 끝에서 부르는 안전 장치: DB 저장이 실패해도 JSON 백업은 이미 저장돼 있다
export async function trySync(label, fn) {
  try {
    console.log(`DB 저장: ${label} ${await fn()}건`);
  } catch (err) {
    console.error(`DB 저장 실패 (${label}): ${err.message} — JSON 백업은 저장됨. node scripts/db-sync.mjs 로 다시 시도할 수 있습니다.`);
    process.exitCode = 1;
  }
}

// 직접 실행: 있는 JSON을 모두 옮긴다 (동 좌표 → 단지 → 출구 → 도보 거리 순서)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.loadEnvFile(".env");
  const db = client();
  await trySync("단지", () => syncComplexes(db));
  await trySync("동 좌표", () => syncDongs(db));
  await trySync("지하철 출구", () => syncExits(db));
  await trySync("도보 거리", () => syncWalking(db));
}
