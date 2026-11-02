import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getComplex, listComplexes } from "@/lib/complexes";
import {
  getDongDistances,
  IMPOSSIBLE_LABEL,
  WALKING_DATA_DATES,
  WALKING_METERS_PER_MINUTE,
  type DongDistance,
} from "@/lib/walking";
import ComplexMap, { type MapPoint } from "./complex-map";
import DongList from "./dong-list";

// 개발 단위 9: 단지를 고르면 동 목록과 동마다 가장 가까운 지하철 출구까지의 도보 거리를 보여준다.

// 단지 목록이 정해져 있으므로 빌드할 때 단지별 화면을 미리 만들어 둔다
export function generateStaticParams() {
  return listComplexes().map((c) => ({ id: c.id }));
}

// 지도에 찍을 점: 동마다 1개, 출구는 여러 동이 같은 출구를 쓰면 1개만
function toMapPoints(dongs: DongDistance[]): MapPoint[] {
  const points: MapPoint[] = [];
  const exits = new Map<string, MapPoint>();
  for (const { dong, result, position, exitPosition } of dongs) {
    if (position) points.push({ label: dong.replace("동", ""), ...position, kind: "dong" });
    if (result.possible && exitPosition) {
      // "민락역 부산2호선 1번출구" → "민락역 1번출구"
      const label = result.exitName.replace(/\s*(부산\d호선|동해선)\s*/, " ");
      exits.set(label, { label, ...exitPosition, kind: "exit" });
    }
  }
  return [...points, ...exits.values()];
}

// 주소의 단지 이름(params)은 Suspense 안에서 읽어야 화면 이동이 바로 일어난다
async function ComplexDetail({ params }: { params: PageProps<"/complex/[id]">["params"] }) {
  const { id } = await params;
  // 한글 단지 이름이 주소에 인코딩된 채로 올 수 있어 풀어서 찾는다
  const complex = getComplex(decodeURIComponent(id));
  if (!complex) notFound();

  const dongs = getDongDistances(complex.name);

  return (
    <>
      <h1 className="mt-4 text-2xl font-bold">{complex.name}</h1>
      <p className="mt-1 text-zinc-500">
        {complex.area}
        {complex.address && ` · ${complex.address}`}
      </p>
      {/* 개발 단위 10: 동 좌표가 없는 단지는 단지 대표 위치로 계산했음을 알린다 */}
      {!complex.hasDongCoordinates && (
        <p className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          동별 좌표 없음
        </p>
      )}

      <div className="mt-6">
        <ComplexMap points={toMapPoints(dongs)} />
      </div>

      <h2 className="mb-3 mt-8 font-semibold">동별 가장 가까운 지하철 입구까지 도보 거리</h2>
      {dongs.length > 0 ? (
        <DongList dongs={dongs} />
      ) : (
        // 계산 결과가 아예 없는 단지도 다른 값으로 대신하지 않고 "불가능"을 보여준다
        <p className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-center text-lg font-bold text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
          {IMPOSSIBLE_LABEL}
        </p>
      )}
    </>
  );
}

// 데이터 기준일과 출처. OpenStreetMap 데이터는 출처 표시가 사용 조건이다
function DataNotice() {
  return (
    <footer className="mt-10 space-y-1 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
      <p>
        출입구 데이터 기준일 {WALKING_DATA_DATES.exitDataDate} · 도보 거리 계산일 {WALKING_DATA_DATES.calculatedAt}
      </p>
      <p>출입구 정보는 실제와 다를 수 있습니다. 공사·폐쇄된 출구는 반영되지 않았을 수 있습니다.</p>
      <p>도보 시간은 모든 동을 분당 {WALKING_METERS_PER_MINUTE}m(시속 3.6km)로 걷는다고 보고 계산했습니다.</p>
      <p>
        도보 거리:{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          © OpenStreetMap contributors
        </a>{" "}
        · 출구·동 위치: 카카오 장소 검색 (일부 동은 OpenStreetMap 건물 위치)
      </p>
    </footer>
  );
}

export default function ComplexPage(props: PageProps<"/complex/[id]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← 검색으로 돌아가기
      </Link>
      <Suspense fallback={<p className="mt-4 text-zinc-500">불러오는 중…</p>}>
        <ComplexDetail params={props.params} />
      </Suspense>
      <DataNotice />
    </main>
  );
}
