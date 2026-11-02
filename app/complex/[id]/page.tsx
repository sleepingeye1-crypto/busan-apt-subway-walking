import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getComplex, listComplexes } from "@/lib/complexes";
import { getDongDistances } from "@/lib/walking";

// 개발 단위 9: 단지를 고르면 동 목록과 동마다 가장 가까운 지하철 출구까지의 도보 거리를 보여준다.

// 단지 목록이 정해져 있으므로 빌드할 때 단지별 화면을 미리 만들어 둔다
export function generateStaticParams() {
  return listComplexes().map((c) => ({ id: c.id }));
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
        부산 {complex.gu} {complex.dong} · {complex.address}
      </p>

      <h2 className="mb-3 mt-8 font-semibold">동별 가장 가까운 지하철 입구까지 도보 거리</h2>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {dongs.map(({ dong, result }) => (
          <li key={dong} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="font-medium">{dong}</p>
              {result.possible && <p className="text-sm text-zinc-500">{result.exitName}</p>}
            </div>
            <p className={`shrink-0 text-lg font-bold ${result.possible ? "" : "text-zinc-400"}`}>{result.label}</p>
          </li>
        ))}
      </ul>
    </>
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
    </main>
  );
}
