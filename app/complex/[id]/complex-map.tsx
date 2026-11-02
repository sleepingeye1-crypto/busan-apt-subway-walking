"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

// 개발 단위 12: 카카오맵에 동(빨강)과 가장 가까운 지하철 출구(파랑)를 표시한다.
// 카카오 JavaScript 키는 브라우저에서 쓰는 키라 NEXT_PUBLIC_ 이름으로 읽는다 (카카오 콘솔에 등록한 도메인에서만 동작).

export type MapPoint = { label: string; lat: number; lng: number; kind: "dong" | "exit" };

declare global {
  interface Window {
    // 카카오맵 SDK는 타입 정의를 제공하지 않는다
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao: any;
  }
}

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;

const LABEL_STYLE = {
  dong: "rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white shadow",
  exit: "rounded bg-blue-600 px-1.5 py-0.5 text-xs font-bold text-white shadow",
} as const;

function MapUnavailable() {
  return (
    <p className="rounded-lg border border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
      지도를 불러오지 못했습니다.
    </p>
  );
}

export default function ComplexMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready || !containerRef.current || points.length === 0) return;
    const { kakao } = window;
    const map = new kakao.maps.Map(containerRef.current, {
      center: new kakao.maps.LatLng(points[0].lat, points[0].lng),
      level: 4,
    });

    // 모든 점이 한 화면에 들어오도록 지도 범위를 맞춘다
    const bounds = new kakao.maps.LatLngBounds();
    for (const point of points) {
      const position = new kakao.maps.LatLng(point.lat, point.lng);
      bounds.extend(position);
      const label = document.createElement("div");
      label.className = LABEL_STYLE[point.kind];
      label.textContent = point.label;
      new kakao.maps.CustomOverlay({ map, position, content: label, yAnchor: 1 });
    }
    map.setBounds(bounds);
  }, [ready, points]);

  if (points.length === 0) return null;
  // 키가 없거나 SDK를 못 불러오면 지도 자리를 비워 두지 않고 안내 문구를 보여준다
  if (!KAKAO_JS_KEY) return <MapUnavailable />;

  return (
    <>
      <Script
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`}
        onReady={() => window.kakao.maps.load(() => setReady(true))}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <MapUnavailable />
      ) : (
        <div
          ref={containerRef}
          className="h-80 w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
          aria-label="동과 지하철 출구 위치 지도"
        />
      )}
    </>
  );
}
