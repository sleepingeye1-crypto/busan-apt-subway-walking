// 개발 단위 6: 계산된 도보 거리에 PRD 규칙을 적용한다.
// - 거리는 미터(m) 단위, 10m 단위 반올림
// - 가장 가까운 출구까지 1.5km 초과, 계산 실패, 경로 없음은 모두 "불가능"
// 다른 값(직선거리 등)으로 대신하지 않는다.

import { cacheLife } from "next/cache";
import { getDb } from "@/lib/supabase";

export const MAX_WALKING_METERS = 1500;
// 도보 시간 기준: 모든 동을 분당 60m(시속 3.6km)로 똑같이 계산한다
export const WALKING_METERS_PER_MINUTE = 60;
export const IMPOSSIBLE_LABEL = "불가능";

// data/walking-distances.json 의 항목 하나 (scripts/calc-walking.mjs 가 만든다)
export type WalkingItem = {
  complex: string;
  dong: string | null;
  basis: "dong" | "complex";
  lat: number | null;
  lng: number | null;
  status: "ok" | "failed" | "no-route" | "no-exit-nearby" | "no-coordinate";
  walkingMeters?: number;
  walkingSeconds?: number;
  snapMeters?: { start: number; end: number };
  exit?: { station: string; line: string; name: string; number: number | null; lat: number; lng: number };
};

export type LatLng = { lat: number; lng: number };

export type WalkingResult =
  | { possible: true; meters: number; label: string; timeLabel: string; exitName: string }
  | { possible: false; label: typeof IMPOSSIBLE_LABEL; reason: "too-far" | "failed" | "not-found" };

export function roundTo10(meters: number): number {
  return Math.round(meters / 10) * 10;
}

// 화면에 표시한 거리(10m 단위)로 도보 시간을 구한다. 올림·반올림 없이 분·초로 보여준다
// 분당 60m는 초당 1m라서 10m 단위 거리는 항상 초 단위로 딱 떨어진다 (예: 460m → 7분 40초)
export function walkingTimeLabel(meters: number): string {
  // 곱셈을 먼저 해서 소수점 오차 없이 정수 초로 계산한다
  const totalSeconds = (meters * 60) / WALKING_METERS_PER_MINUTE;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  if (minutes === 0) return `${seconds}초`;
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`;
}

export function toWalkingResult(item: WalkingItem): WalkingResult {
  if (item.status === "failed") {
    return { possible: false, label: IMPOSSIBLE_LABEL, reason: "failed" };
  }
  if (item.status !== "ok" || item.walkingMeters === undefined || !item.exit) {
    return { possible: false, label: IMPOSSIBLE_LABEL, reason: "not-found" };
  }
  // 1.5km 초과 여부는 반올림 전 실제 값으로 판단한다
  if (item.walkingMeters > MAX_WALKING_METERS) {
    return { possible: false, label: IMPOSSIBLE_LABEL, reason: "too-far" };
  }

  const meters = roundTo10(item.walkingMeters);
  return {
    possible: true,
    meters,
    label: `${meters.toLocaleString("ko-KR")}m`,
    timeLabel: walkingTimeLabel(meters),
    exitName: item.exit.name,
  };
}

// 개발 단위 10: 화면에 함께 보여줄 데이터 기준일 (DB의 data_meta 표에서 읽는다)
export async function getWalkingDataDates(): Promise<{ exitDataDate: string; calculatedAt: string }> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getDb()
    .from("data_meta")
    .select("key, generated_at")
    .in("key", ["subway_exits", "walking_distances"]);
  if (error) throw new Error(`데이터 기준일을 읽지 못했습니다: ${error.message}`);

  const dateOf = (key: string) => data.find((row) => row.key === key)?.generated_at ?? "알 수 없음";
  return { exitDataDate: dateOf("subway_exits"), calculatedAt: dateOf("walking_distances") };
}

export type DongDistance = {
  dong: string;
  basis: WalkingItem["basis"];
  result: WalkingResult;
  position: LatLng | null; // 동(또는 단지 대표 위치) 좌표 — 지도 표시용
  exitPosition: LatLng | null; // 가장 가까운 출구 좌표 — 지도 표시용
};

// DB의 walking_distances 표 한 행 (scripts/db-sync.mjs 가 저장한다)
type WalkingRow = {
  dong: string | null;
  basis: WalkingItem["basis"];
  lat: number | null;
  lng: number | null;
  status: WalkingItem["status"];
  walking_meters: number | null;
  walking_seconds: number | null;
  exit_station: string | null;
  exit_line: string | null;
  exit_name: string | null;
  exit_number: number | null;
  exit_lat: number | null;
  exit_lng: number | null;
};

function toWalkingItem(complexName: string, row: WalkingRow): WalkingItem {
  const hasExit = row.exit_name !== null && row.exit_lat !== null && row.exit_lng !== null;
  return {
    complex: complexName,
    dong: row.dong,
    basis: row.basis,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    walkingMeters: row.walking_meters ?? undefined,
    walkingSeconds: row.walking_seconds ?? undefined,
    exit: hasExit
      ? {
          station: row.exit_station ?? "",
          line: row.exit_line ?? "",
          name: row.exit_name!,
          number: row.exit_number,
          lat: row.exit_lat!,
          lng: row.exit_lng!,
        }
      : undefined,
  };
}

// 개발 단위 9: 단지 하나의 동별 도보 거리 (동 번호 순). DB에서 읽는다
export async function getDongDistances(complexName: string): Promise<DongDistance[]> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getDb().from("walking_distances").select("*").eq("complex_name", complexName);
  if (error) throw new Error(`도보 거리를 읽지 못했습니다: ${error.message}`);

  const items = (data as WalkingRow[]).map((row) => toWalkingItem(complexName, row));
  const dongNumber = (dong: string | null) => Number(dong?.replace(/\D/g, "") ?? 0);
  return items
    .sort((a, b) => dongNumber(a.dong) - dongNumber(b.dong))
    .map((item) => {
      const result = toWalkingResult(item);
      return {
        dong: item.dong ?? "단지 대표 위치",
        basis: item.basis,
        result,
        position: item.lat !== null && item.lng !== null ? { lat: item.lat, lng: item.lng } : null,
        // "불가능"인 동은 출구를 지도에 표시하지 않는다
        exitPosition: result.possible && item.exit ? { lat: item.exit.lat, lng: item.exit.lng } : null,
      };
    });
}
