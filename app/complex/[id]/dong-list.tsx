"use client";

import { useState } from "react";
import type { DongDistance } from "@/lib/walking";

// 동별 도보 거리 목록. "동 순"(기본)과 "거리 순" 버튼으로 정렬을 바꾼다.
// 정렬은 브라우저에서만 바꾸므로 지도는 다시 그려지지 않는다.

type SortKey = "dong" | "distance";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "dong", label: "동 순" },
  { key: "distance", label: "거리 순" },
];

// 거리 순: 가까운 동부터. "불가능"인 동은 맨 뒤로 보낸다
function byDistance(a: DongDistance, b: DongDistance): number {
  const meters = (d: DongDistance) => (d.result.possible ? d.result.meters : Infinity);
  return meters(a) - meters(b);
}

export default function DongList({ dongs }: { dongs: DongDistance[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("dong");
  // 서버에서 받은 목록이 이미 동 번호 순이므로 "동 순"은 그대로 쓴다
  const sorted = sortKey === "distance" ? [...dongs].sort(byDistance) : dongs;

  return (
    <>
      <div className="mb-3 flex gap-2" role="group" aria-label="정렬">
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortKey(key)}
            aria-pressed={sortKey === key}
            className={`rounded-full border px-3 py-1 text-sm ${
              sortKey === key
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {sorted.map(({ dong, basis, result }) => (
          <li key={dong} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="font-medium">{dong}</p>
              {result.possible && <p className="text-sm text-zinc-500">{result.exitName}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-lg font-bold ${result.possible ? "" : "text-zinc-400"}`}>{result.label}</p>
              {result.possible && basis === "complex" && (
                <p className="text-xs text-amber-700 dark:text-amber-300">단지 대표 위치 기준</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
