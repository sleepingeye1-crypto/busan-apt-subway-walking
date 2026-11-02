// 개발 단위 6: 계산된 도보 거리에 PRD 규칙을 적용한다.
// - 거리는 미터(m) 단위, 10m 단위 반올림
// - 가장 가까운 출구까지 1.5km 초과, 계산 실패, 경로 없음은 모두 "불가능"
// 다른 값(직선거리 등)으로 대신하지 않는다.

import walkingData from "@/data/walking-distances.json";

export const MAX_WALKING_METERS = 1500;
export const IMPOSSIBLE_LABEL = "불가능";

// data/walking-distances.json 의 항목 하나 (scripts/calc-walking.mjs 가 만든다)
export type WalkingItem = {
  complex: string;
  dong: string | null;
  basis: "dong" | "complex";
  status: "ok" | "failed" | "no-route" | "no-exit-nearby" | "no-coordinate";
  walkingMeters?: number;
  walkingSeconds?: number;
  exit?: { station: string; line: string; name: string; number: number | null };
};

export type WalkingResult =
  | { possible: true; meters: number; label: string; exitName: string }
  | { possible: false; label: typeof IMPOSSIBLE_LABEL; reason: "too-far" | "failed" | "not-found" };

export function roundTo10(meters: number): number {
  return Math.round(meters / 10) * 10;
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
  return { possible: true, meters, label: `${meters.toLocaleString("ko-KR")}m`, exitName: item.exit.name };
}

// 개발 단위 10: 화면에 함께 보여줄 데이터 기준일
export const WALKING_DATA_DATES = {
  exitDataDate: walkingData.exitDataDate,
  calculatedAt: walkingData.generatedAt,
};

export type DongDistance = { dong: string; basis: WalkingItem["basis"]; result: WalkingResult };

const ITEMS = walkingData.items as WalkingItem[];

// 개발 단위 9: 단지 하나의 동별 도보 거리 (동 번호 순)
export function getDongDistances(complexName: string): DongDistance[] {
  const dongNumber = (dong: string | null) => Number(dong?.replace(/\D/g, "") ?? 0);
  return ITEMS.filter((item) => item.complex === complexName)
    .sort((a, b) => dongNumber(a.dong) - dongNumber(b.dong))
    .map((item) => ({ dong: item.dong ?? "단지 대표 위치", basis: item.basis, result: toWalkingResult(item) }));
}
